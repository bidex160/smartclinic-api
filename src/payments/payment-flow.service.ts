import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { randomBytes } from "node:crypto";
import { isEmail } from "class-validator";
import { BookingContact } from "../bookings/entities/booking-contact.entity";
import { appConfig } from "../config/app.config";
import { BookingFunding } from "../bookings/entities/booking-funding.entity";
import { BookingStatusHistory } from "../bookings/entities/booking-status-history.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingFundingSourceType } from "../bookings/enums/booking-funding-source-type.enum";
import { BookingFundingStatus } from "../bookings/enums/booking-funding-status.enum";
import { BookingStatus } from "../bookings/enums/booking-status.enum";
import { CheckoutFundingOption } from "../bookings/enums/checkout-funding-option.enum";
import { PaymentAttempt } from "./entities/payment-attempt.entity";
import { PaymentTransaction } from "./entities/payment-transaction.entity";
import { PaymentAttemptStatus } from "./enums/payment-attempt-status.enum";
import { PaymentTransactionStatus } from "./enums/payment-transaction-status.enum";
import { PaymentTransactionType } from "./enums/payment-transaction-type.enum";
import {
  PAYMENT_PROVIDER_ADAPTER,
  PaymentProviderAdapter,
  VerifyPaymentResult,
} from "./payment-provider.adapter";
import { PaymentOperationResponseDto } from "./dto/payment-operation-response.dto";
import { PublicPaymentStatusResponseDto } from "./dto/public-payment-status-response.dto";
import { ProviderMatchingService } from "../providers/provider-matching.service";
import { RewardBookingRedemption } from "../rewards/entities/reward-booking-redemption.entity";
import { RewardConversionRate } from "../rewards/entities/reward-conversion-rate.entity";
import { RewardPointsLedger } from "../rewards/entities/reward-points-ledger.entity";
import { RewardBookingRedemptionStatus } from "../rewards/enums/reward-booking-redemption-status.enum";
import { RewardLedgerDirection } from "../rewards/enums/reward-ledger-direction.enum";
import { RewardWithdrawalsService } from "../rewards/reward-withdrawals.service";
import { User } from "../users/entities/user.entity";
import { FastTrackRequest } from '../fasttrack/entities/fasttrack-request.entity';
import { FastTrackRequestStatusHistory } from '../fasttrack/entities/fasttrack-request-status-history.entity';
import { FastTrackStatus } from '../fasttrack/enums/fasttrack-status.enum';
import { ProviderEarningsService } from '../earnings/provider-earnings.service';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestFunding } from '../care-requests/entities/care-request-funding.entity';
import { CareRequestFundingStatus } from '../care-requests/enums/care-request-funding-status.enum';
import { CareRequestStatus } from '../care-requests/enums/care-request-status.enum';
import { CommissionResolutionService } from '../commissions/commission-resolution.service';

@Injectable()
export class PaymentFlowService {
  private readonly logger = new Logger(PaymentFlowService.name);
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(PaymentAttempt)
    private readonly attempts: Repository<PaymentAttempt>,
    @Inject(PAYMENT_PROVIDER_ADAPTER)
    private readonly provider: PaymentProviderAdapter,
    @Optional()
    @Inject(appConfig.KEY)
    private readonly config?: ConfigType<typeof appConfig>,
    @Optional()
    private readonly matching?: ProviderMatchingService,
    @Optional()
    private readonly rewards?: RewardWithdrawalsService,
    @Optional()
    private readonly earnings?: ProviderEarningsService,
    @Optional()
    private readonly commissions?: CommissionResolutionService,
  ) {}

  async previewRewardRedemption(reference: string, userId: string) {
    const booking = await this.bookings.findOne({ where: { bookingReference: reference } });
    if (!booking || !booking.quotedAmount || !booking.currency) throw new NotFoundException("Booking not found");
    const rate = await this.bookings.manager.getRepository(RewardConversionRate).findOne({ where: { isActive: true }, order: { effectiveFrom: "DESC" } });
    if (!rate || !this.rewards) throw new ConflictException("Reward redemption is not currently configured");
    const balance = await this.rewards.balance(userId);
    const totalMinor = this.toMinor(booking.quotedAmount);
    const rateMinor = this.toMinor(rate.amount);
    const maximumRedeemablePoints = Number((totalMinor * BigInt(rate.points)) / rateMinor);
    const active = await this.bookings.manager.getRepository(RewardBookingRedemption).findOne({ where: { bookingId: booking.id, status: RewardBookingRedemptionStatus.RESERVED } });
    return { availablePoints: balance.availablePoints, maximumRedeemablePoints, bookingOutstandingAmount: this.fromMinor(totalMinor), currency: booking.currency, activeRedemption: active ? this.redemptionView(active, totalMinor) : null };
  }

  async applyRewardPoints(reference: string, userId: string, points: number) {
    if (!this.rewards) throw new ConflictException("Reward redemption is not currently configured");
    const rewards = this.rewards;
    let settledReference: string | null = null;
    const result = await this.bookings.manager.transaction(async (manager) => {
      const booking = await manager.getRepository(Booking).findOne({ where: { bookingReference: reference }, lock: { mode: "pessimistic_write" } });
      if (!booking || !booking.quotedAmount || !booking.currency) throw new NotFoundException("Booking not found");
      if (booking.status !== BookingStatus.AWAITING_FUNDING) throw new ConflictException("Booking is not eligible for reward redemption");
      if (booking.commercialProviderId === null || booking.commercialProviderServiceId === null) throw new ConflictException('Booking requires provider commercial binding before funding');
      const redemptionRepository = manager.getRepository(RewardBookingRedemption);
      if (await redemptionRepository.findOne({ where: { bookingId: booking.id, status: RewardBookingRedemptionStatus.RESERVED }, lock: { mode: "pessimistic_write" } })) throw new ConflictException("Booking already has an active reward redemption");
      const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } });
      if (!user) throw new NotFoundException("User not found");
      const fundingRepository = manager.getRepository(BookingFunding);
      let funding = await fundingRepository.findOne({ where: { bookingId: booking.id, sourceType: BookingFundingSourceType.SELF }, lock: { mode: "pessimistic_write" } });
      if (funding?.status === BookingFundingStatus.SETTLED) throw new ConflictException("Booking funding is already settled");
      if (funding && await this.hasActiveAttempt(manager, funding.id)) throw new ConflictException("Reward points cannot change while an external payment attempt is active");
      const rate = await manager.getRepository(RewardConversionRate).findOne({ where: { isActive: true }, order: { effectiveFrom: "DESC" } });
      if (!rate) throw new ConflictException("Reward redemption conversion is not configured");
      const balance = await rewards.balance(userId, manager);
      if (points > balance.availablePoints) throw new ConflictException("Insufficient available reward points");
      const totalMinor = this.toMinor(booking.quotedAmount);
      const rateMinor = this.toMinor(rate.amount);
      const amountMinor = (BigInt(points) * rateMinor) / BigInt(rate.points);
      if (amountMinor <= 0n) throw new BadRequestException("Requested points do not convert to a usable amount");
      if (amountMinor > totalMinor) throw new ConflictException("Requested points exceed the maximum useful redemption for this booking");
      const redemption = await redemptionRepository.save(redemptionRepository.create({ bookingId: booking.id, userId, pointsReserved: points, ratePoints: rate.points, rateAmountMinor: rateMinor.toString(), amountMinor: amountMinor.toString(), currency: rate.currency.toUpperCase(), status: RewardBookingRedemptionStatus.RESERVED, settledAt: null, releasedAt: null }));
      const remainingMinor = totalMinor - amountMinor;
      if (!funding) funding = fundingRepository.create({ bookingId: booking.id, sourceType: BookingFundingSourceType.SELF, responsibleUserId: userId, responsibleOrganisationId: null, payerContactId: null, amount: this.fromMinor(remainingMinor), percentage: null, currency: booking.currency, status: BookingFundingStatus.PENDING, checkoutOption: CheckoutFundingOption.PAY_NOW });
      funding.amount = this.fromMinor(remainingMinor);
      if (remainingMinor === 0n) {
        await this.settleRedemption(manager, redemption);
        if (this.earnings) await this.earnings.createHeldHealthCheckEarning(manager, booking, null);
        funding.status = BookingFundingStatus.SETTLED;
        const fromStatus = booking.status; booking.status = BookingStatus.PENDING_PROVIDER_MATCH;
        await manager.getRepository(Booking).save(booking);
        const history = manager.getRepository(BookingStatusHistory); await history.save(history.create({ bookingId: booking.id, fromStatus, toStatus: booking.status, actorUserId: userId, reasonCode: "REWARD_POINTS_FUNDING_CONFIRMED", reasonNote: null }));
        settledReference = booking.bookingReference;
      }
      await fundingRepository.save(funding);
      return { bookingReference: booking.bookingReference, bookingTotal: booking.quotedAmount, pointsReserved: redemption.pointsReserved, pointsAmount: this.fromMinor(amountMinor), remainingExternalAmount: this.fromMinor(remainingMinor), currency: booking.currency, redemptionStatus: redemption.status, fundingStatus: funding.status, requiresExternalPayment: remainingMinor > 0n };
    });
    if (settledReference) await this.startMatchingAfterSettlement(settledReference);
    return result;
  }

  async releaseRewardPoints(reference: string, userId: string) {
    return this.bookings.manager.transaction(async (manager) => {
      const booking = await manager.getRepository(Booking).findOne({ where: { bookingReference: reference }, lock: { mode: "pessimistic_write" } });
      if (!booking || !booking.quotedAmount) throw new NotFoundException("Booking not found");
      const redemption = await manager.getRepository(RewardBookingRedemption).findOne({ where: { bookingId: booking.id, userId, status: RewardBookingRedemptionStatus.RESERVED }, lock: { mode: "pessimistic_write" } });
      if (!redemption) throw new NotFoundException("Active reward redemption not found");
      await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } });
      const funding = await manager.getRepository(BookingFunding).findOne({ where: { bookingId: booking.id, sourceType: BookingFundingSourceType.SELF }, lock: { mode: "pessimistic_write" } });
      if (funding && await this.hasActiveAttempt(manager, funding.id)) throw new ConflictException("Reward points cannot be released while an external payment attempt is active");
      redemption.status = RewardBookingRedemptionStatus.RELEASED; redemption.releasedAt = new Date(); await manager.getRepository(RewardBookingRedemption).save(redemption);
      if (funding) { funding.amount = booking.quotedAmount; await manager.getRepository(BookingFunding).save(funding); }
      return { bookingReference: reference, redemptionStatus: redemption.status, releasedPoints: redemption.pointsReserved };
    });
  }

  async initializeFunding(
    reference: string,
    actorUserId: string | null,
    checkoutOption: CheckoutFundingOption = CheckoutFundingOption.PAY_NOW,
  ): Promise<PaymentOperationResponseDto> {
    return this.bookings.manager.transaction(async (manager) => {
      const booking = await manager
        .getRepository(Booking)
        .findOne({
          where: { bookingReference: reference },
          lock: { mode: "pessimistic_write" },
        });
      if (!booking) throw new NotFoundException("Booking not found");
      if (
        ![BookingStatus.DRAFT, BookingStatus.AWAITING_FUNDING].includes(
          booking.status,
        )
      )
        throw new ConflictException(
          `Booking in ${booking.status} cannot initialize funding`,
        );
      if (!booking.quotedAmount || !booking.currency)
        throw new BadRequestException(
          "Booking does not have a complete server quote",
        );
      if (booking.commercialProviderId === null || booking.commercialProviderServiceId === null) throw new ConflictException('Booking requires provider commercial binding before funding');
      const payerContact = booking.bookerUserId
        ? null
        : await manager
            .getRepository(BookingContact)
            .findOne({ where: { bookingId: booking.id } });
      if (!booking.bookerUserId && !payerContact)
        throw new ConflictException(
          "Guest booking does not have a payer contact snapshot",
        );
      const fundingRepository = manager.getRepository(BookingFunding);
      const activeRedemption = await this.findRedemption(manager, booking.id, false);
      const expectedFundingAmount = activeRedemption
        ? this.fromMinor(this.toMinor(booking.quotedAmount) - BigInt(activeRedemption.amountMinor))
        : booking.quotedAmount;
      let funding = await fundingRepository.findOne({
        where: {
          bookingId: booking.id,
          sourceType: BookingFundingSourceType.SELF,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (
        funding &&
        (funding.amount !== expectedFundingAmount ||
          funding.currency !== booking.currency)
      )
        throw new ConflictException(
          "Existing funding obligation does not match the booking quote",
        );
      if (!funding)
        funding = await fundingRepository.save(
          fundingRepository.create({
            bookingId: booking.id,
            sourceType: BookingFundingSourceType.SELF,
            responsibleUserId: booking.bookerUserId,
            responsibleOrganisationId: null,
            payerContactId: payerContact?.id ?? null,
            amount: expectedFundingAmount,
            percentage: null,
            currency: booking.currency,
            status: BookingFundingStatus.PENDING,
            checkoutOption,
          }),
        );
      else if (funding.status === BookingFundingStatus.SETTLED)
        throw new ConflictException('Settled funding cannot change checkout option');
      else if (funding.checkoutOption !== checkoutOption) {
        funding.checkoutOption = checkoutOption;
        funding = await fundingRepository.save(funding);
      }
      if (booking.status === BookingStatus.DRAFT) {
        booking.status = BookingStatus.AWAITING_FUNDING;
        await manager.getRepository(Booking).save(booking);
        const history = manager.getRepository(BookingStatusHistory);
        await history.save(
          history.create({
            bookingId: booking.id,
            fromStatus: BookingStatus.DRAFT,
            toStatus: BookingStatus.AWAITING_FUNDING,
            actorUserId,
            reasonCode: "SELF_FUNDING_INITIALIZED",
            reasonNote: null,
          }),
        );
      }
      return this.response(booking, funding, null);
    });
  }

  async initiatePayment(
    reference: string,
    idempotencyKey: string,
    callbackUrl?: string,
  ): Promise<PaymentOperationResponseDto> {
    const existing = await this.attempts.findOne({
      where: { idempotencyKey },
      relations: { bookingFunding: { booking: true } },
    });
    if (existing) {
      if (!existing.bookingFunding) throw new ConflictException('Idempotency key belongs to a different payment obligation');
      if (existing.bookingFunding.booking.bookingReference !== reference)
        throw new ConflictException(
          "Idempotency key belongs to a different booking",
        );
      return this.response(
        existing.bookingFunding.booking,
        existing.bookingFunding,
        existing,
      );
    }
    const funding = await this.requireFunding(reference);
    if (this.toMinor(funding.amount!) === 0n) throw new ConflictException("Booking has no external amount remaining");
    const customerEmail =
      funding.responsibleUser?.email ?? funding.payerContact?.email;
    if (!customerEmail || !isEmail(customerEmail))
      throw new BadRequestException(
        "A valid payer email is required to initialize payment",
      );
    const paymentReference = `SC-PAY-${randomBytes(12).toString("hex")}`;
    const initialized = await this.provider.initializePayment({
      amount: funding.amount!,
      currency: funding.currency,
      idempotencyKey,
      bookingReference: reference,
      customerEmail,
      paymentReference,
      callbackUrl: callbackUrl ?? this.callbackUrl(reference, false),
    });
    return this.bookings.manager.transaction(async (manager) => {
      const attemptRepository = manager.getRepository(PaymentAttempt);
      const raced = await attemptRepository.findOne({
        where: { idempotencyKey },
      });
      if (raced) return this.response(funding.booking, funding, raced);
      const attempt = await attemptRepository.save(
        attemptRepository.create({
          bookingFundingId: funding.id,
          amount: funding.amount!,
          currency: funding.currency,
          status: initialized.status,
          idempotencyKey,
          providerCode: initialized.providerCode,
          providerReference: initialized.providerReference,
          checkoutUrl: initialized.checkoutUrl,
          accessCode: initialized.accessCode,
        }),
      );
      return this.response(funding.booking, funding, attempt);
    });
  }
  async initiatePublicPayment(
    reference: string,
    option: CheckoutFundingOption = CheckoutFundingOption.PAY_NOW,
  ): Promise<PaymentOperationResponseDto> {
    if (option === CheckoutFundingOption.PAY_LATER)
      throw new BadRequestException('PAY_LATER does not initialize a payment provider');
    const funding = await this.requireFunding(reference);
    if (this.toMinor(funding.amount!) === 0n) throw new ConflictException("Booking has no external amount remaining");
    const active = await this.attempts.findOne({
      where: {
        bookingFundingId: funding.id,
        status: In([
          PaymentAttemptStatus.CREATED,
          PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION,
          PaymentAttemptStatus.PENDING_CONFIRMATION,
        ]),
      },
      order: { createdAt: 'DESC' },
    });
    if (active) return this.response(funding.booking, funding, active);
    return this.initiatePayment(reference, `PUBLIC-${randomBytes(16).toString("hex")}`, this.callbackUrl(reference, false));
  }

  async initiatePatientPayment(
    reference: string,
    option: CheckoutFundingOption = CheckoutFundingOption.PAY_NOW,
  ): Promise<PaymentOperationResponseDto> {
    if (option === CheckoutFundingOption.PAY_LATER)
      throw new BadRequestException("PAY_LATER does not initialize a payment provider");
    const funding = await this.requireFunding(reference);
    if (this.toMinor(funding.amount!) === 0n) throw new ConflictException("Booking has no external amount remaining");
    const active = await this.attempts.findOne({
      where: {
        bookingFundingId: funding.id,
        status: In([
          PaymentAttemptStatus.CREATED,
          PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION,
          PaymentAttemptStatus.PENDING_CONFIRMATION,
        ]),
      },
      order: { createdAt: "DESC" },
    });
    if (active) return this.response(funding.booking, funding, active);
    return this.initiatePayment(
      reference,
      `PATIENT-${randomBytes(16).toString("hex")}`,
      this.callbackUrl(reference, true),
    );
  }

  async confirmPayment(
    attemptId: string,
    actorUserId: string,
  ): Promise<PaymentOperationResponseDto> {
    const current = await this.attempts.findOne({
      where: { id: attemptId },
      relations: { bookingFunding: { booking: true } },
    });
    if (!current) throw new NotFoundException("Payment attempt not found");
    if (!current.bookingFunding) throw new ConflictException('Payment attempt does not belong to booking funding');
    if (current.status === PaymentAttemptStatus.SUCCEEDED) {
      await this.ensureMatchingStarted(current.bookingFunding.booking);
      return this.response(
        current.bookingFunding.booking,
        current.bookingFunding,
        current,
      );
    }
    if (!current.providerReference)
      throw new ConflictException("Payment attempt has no provider reference");
    const verified = await this.provider.verifyPayment(
      current.providerReference,
    );
    return this.applyVerification(attemptId, actorUserId, verified);
  }

  async confirmProviderReference(
    providerCode: string,
    providerReference: string,
  ): Promise<PaymentOperationResponseDto> {
    const attempt = await this.attempts.findOne({
      where: { providerCode, providerReference },
    });
    if (!attempt) throw new NotFoundException("Payment attempt not found");
    const verified = await this.provider.verifyPayment(providerReference);
    return this.applyVerification(attempt.id, null, verified);
  }
  async applyProviderVerification(
    providerCode: string,
    providerReference: string,
    verified: VerifyPaymentResult,
  ): Promise<PaymentOperationResponseDto> {
    const attempt = await this.attempts.findOne({
      where: { providerCode, providerReference },
    });
    if (!attempt) throw new NotFoundException("Payment attempt not found");
    if (attempt.fastTrackRequestId) return this.applyFastTrackVerification(attempt.id, null, verified) as never;
    if (attempt.careRequestFundingId) return this.applyCareRequestVerification(attempt.id, null, verified) as never;
    return this.applyVerification(attempt.id, null, verified);
  }

  async getCareRequestFunding(reference: string, userId: string) {
    const care = await this.bookings.manager.getRepository(CareRequest).findOne({ where: { reference, userId } }); if (!care) throw new NotFoundException('Care Request was not found');
    const funding = await this.bookings.manager.getRepository(CareRequestFunding).findOne({ where: { careRequestId: care.id } }); const attempt = funding ? await this.attempts.findOne({ where: { careRequestFundingId: funding.id }, order: { createdAt: 'DESC' } }) : null;
    return this.careFundingResponse(care, funding, attempt);
  }

  async initializeCareRequestFunding(reference: string, userId: string) {
    if (!this.commissions) throw new ConflictException('Provider commission is not available');
    const prepared = await this.bookings.manager.transaction(async manager => {
      const care = await manager.getRepository(CareRequest).findOne({ where: { reference, userId }, relations: { user: true }, lock: { mode: 'pessimistic_write', tables: ['care_requests'] } });
      if (!care) throw new NotFoundException('Care Request was not found');
      if (care.status !== CareRequestStatus.PROVIDER_ACCEPTED || !care.assignedProviderId || !care.assignedProviderCareServiceId || care.servicePriceMinor == null || !care.serviceCurrency) throw new ConflictException('Care Request is not commercially ready for payment');
      let funding = await manager.getRepository(CareRequestFunding).findOne({ where: { careRequestId: care.id }, lock: { mode: 'pessimistic_write' } });
      if (BigInt(care.servicePriceMinor) === 0n) { if (!funding) funding = await manager.getRepository(CareRequestFunding).save({ careRequestId: care.id, amountMinor: '0', currency: care.serviceCurrency, status: CareRequestFundingStatus.SATISFIED_FREE, paidAt: null }); return { care, funding, free: true }; }
      await this.commissions!.requireForProvider(care.assignedProviderId, manager);
      if (!funding) funding = await manager.getRepository(CareRequestFunding).save({ careRequestId: care.id, amountMinor: care.servicePriceMinor, currency: care.serviceCurrency, status: CareRequestFundingStatus.PENDING, paidAt: null });
      if (funding.amountMinor !== care.servicePriceMinor || funding.currency !== care.serviceCurrency) throw new ConflictException('Care Request funding does not match its commercial snapshot');
      return { care, funding, free: false };
    });
    if (prepared.free || prepared.funding.status === CareRequestFundingStatus.PAID) return this.careFundingResponse(prepared.care, prepared.funding, null);
    const active = await this.attempts.findOne({ where: { careRequestFundingId: prepared.funding.id, status: In([PaymentAttemptStatus.CREATED, PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, PaymentAttemptStatus.PENDING_CONFIRMATION]) }, order: { createdAt: 'DESC' } }); if (active) return this.careFundingResponse(prepared.care, prepared.funding, active);
    if (!prepared.care.user?.email || !isEmail(prepared.care.user.email)) throw new BadRequestException('A valid account email is required to initialize payment');
    const idempotencyKey = `GENERAL-CARE-${randomBytes(16).toString('hex')}`; const paymentReference = `SC-PAY-${randomBytes(12).toString('hex')}`;
    const initialized = await this.provider.initializePayment({ amount: this.fromMinor(BigInt(prepared.funding.amountMinor)), currency: prepared.funding.currency, idempotencyKey, bookingReference: reference, customerEmail: prepared.care.user.email, paymentReference, callbackUrl: this.callbackUrl(reference, true) });
    return this.bookings.manager.transaction(async manager => { const funding = await manager.getRepository(CareRequestFunding).findOne({ where: { id: prepared.funding.id }, lock: { mode: 'pessimistic_write' } }); if (!funding || funding.status !== CareRequestFundingStatus.PENDING) throw new ConflictException('Care Request funding is no longer payable'); const repo = manager.getRepository(PaymentAttempt); const raced = await repo.findOne({ where: { careRequestFundingId: funding.id, status: In([PaymentAttemptStatus.CREATED, PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, PaymentAttemptStatus.PENDING_CONFIRMATION]) } }); if (raced) return this.careFundingResponse(prepared.care, funding, raced); const attempt = await repo.save(repo.create({ bookingFundingId: null, fastTrackRequestId: null, careRequestFundingId: funding.id, amount: this.fromMinor(BigInt(funding.amountMinor)), currency: funding.currency, status: initialized.status, idempotencyKey, providerCode: initialized.providerCode, providerReference: initialized.providerReference, checkoutUrl: initialized.checkoutUrl, accessCode: initialized.accessCode })); return this.careFundingResponse(prepared.care, funding, attempt); });
  }

  async verifyLatestCareRequestFunding(reference: string, userId: string) {
    const care = await this.bookings.manager.getRepository(CareRequest).findOne({ where: { reference, userId } }); if (!care) throw new NotFoundException('Care Request was not found'); const funding = await this.bookings.manager.getRepository(CareRequestFunding).findOne({ where: { careRequestId: care.id } }); if (!funding) throw new ConflictException('Care Request funding has not been initialized'); if (funding.status !== CareRequestFundingStatus.PENDING) return this.getCareRequestFunding(reference, userId);
    const attempt = await this.attempts.findOne({ where: { careRequestFundingId: funding.id }, order: { createdAt: 'DESC' } }); if (!attempt?.providerReference) throw new ConflictException('No General Care payment attempt is available to verify'); if (attempt.status !== PaymentAttemptStatus.SUCCEEDED) { await this.claimVerification(attempt.id); const verified = await this.provider.verifyPayment(attempt.providerReference); await this.applyCareRequestVerification(attempt.id, userId, verified); } return this.getCareRequestFunding(reference, userId);
  }

  private async applyCareRequestVerification(attemptId: string, actorUserId: string | null, verified: VerifyPaymentResult) {
    if (!this.earnings) throw new ConflictException('Provider earnings accounting is not available');
    return this.bookings.manager.transaction(async manager => { const attemptRepo = manager.getRepository(PaymentAttempt); const attempt = await attemptRepo.findOne({ where: { id: attemptId }, lock: { mode: 'pessimistic_write' } }); if (!attempt?.careRequestFundingId) throw new NotFoundException('General Care payment attempt was not found'); const fundingRepo = manager.getRepository(CareRequestFunding); const funding = await fundingRepo.findOne({ where: { id: attempt.careRequestFundingId }, lock: { mode: 'pessimistic_write' } }); if (!funding) throw new NotFoundException('Care Request funding was not found'); const care = await manager.getRepository(CareRequest).findOne({ where: { id: funding.careRequestId }, lock: { mode: 'pessimistic_write' } }); if (!care) throw new NotFoundException('Care Request was not found'); if (attempt.status === PaymentAttemptStatus.SUCCEEDED && funding.status === CareRequestFundingStatus.PAID) return this.careFundingResponse(care, funding, attempt);
      const expected = this.fromMinor(BigInt(funding.amountMinor)); if (verified.providerReference !== attempt.providerReference || verified.amount !== attempt.amount || verified.currency !== attempt.currency || attempt.amount !== expected || attempt.currency !== funding.currency || funding.amountMinor !== care.servicePriceMinor || funding.currency !== care.serviceCurrency) { attempt.status = PaymentAttemptStatus.FAILED; await attemptRepo.save(attempt); return this.careFundingResponse(care, funding, attempt); } if (!verified.succeeded || verified.status !== PaymentAttemptStatus.SUCCEEDED) { attempt.status = verified.status; await attemptRepo.save(attempt); return this.careFundingResponse(care, funding, attempt); }
      const txRepo = manager.getRepository(PaymentTransaction); let transaction = await txRepo.findOne({ where: { providerReference: verified.providerReference } }); if (transaction && transaction.paymentAttemptId !== attempt.id) throw new ConflictException('Verified provider transaction belongs to another payment attempt'); if (!transaction) transaction = await txRepo.save(txRepo.create({ paymentAttemptId: attempt.id, parentTransactionId: null, transactionType: PaymentTransactionType.COLLECTION, status: PaymentTransactionStatus.SUCCEEDED, amount: verified.amount, currency: verified.currency, providerReference: verified.providerReference, occurredAt: verified.occurredAt })); await this.earnings!.createHeldGeneralCareEarning(manager, care, transaction); attempt.status = PaymentAttemptStatus.SUCCEEDED; await attemptRepo.save(attempt); funding.status = CareRequestFundingStatus.PAID; funding.paidAt = verified.occurredAt; await fundingRepo.save(funding); return this.careFundingResponse(care, funding, attempt); });
  }

  private careFundingResponse(care: CareRequest, funding: CareRequestFunding | null, attempt: PaymentAttempt | null) { const free = care.servicePriceMinor === '0'; return { careRequestReference: care.reference, fundingRequired: !free, amountMinor: care.servicePriceMinor === null ? null : Number(care.servicePriceMinor), currency: care.serviceCurrency, fundingStatus: funding?.status ?? null, paid: funding?.status === CareRequestFundingStatus.PAID || funding?.status === CareRequestFundingStatus.SATISFIED_FREE, initializationAllowed: care.status === CareRequestStatus.PROVIDER_ACCEPTED && Boolean(care.assignedProviderId && care.assignedProviderCareServiceId && care.servicePriceMinor != null), paymentAttemptStatus: attempt?.status ?? null, paymentReference: attempt?.providerReference ?? null, checkoutUrl: attempt?.checkoutUrl ?? null, accessCode: attempt?.accessCode ?? null, paidAt: funding?.paidAt ?? null }; }

  async initializeFastTrackPayment(reference: string, userId: string) {
    const existingRequest = await this.bookings.manager.getRepository(FastTrackRequest).findOne({ where: { reference, userId }, relations: { user: true } });
    if (!existingRequest) throw new NotFoundException('FastTrack request was not found');
    if (![FastTrackStatus.READY_FOR_PAYMENT, FastTrackStatus.PAYMENT_PENDING].includes(existingRequest.status)) throw new ConflictException('FastTrack request is not ready for payment');
    const active = await this.attempts.findOne({ where: { fastTrackRequestId: existingRequest.id, status: In([PaymentAttemptStatus.CREATED, PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, PaymentAttemptStatus.PENDING_CONFIRMATION]) }, order: { createdAt: 'DESC' } });
    if (active) return this.fastTrackPaymentResponse(existingRequest, active);
    if (!existingRequest.user?.email || !isEmail(existingRequest.user.email)) throw new BadRequestException('A valid account email is required to initialize payment');
    const idempotencyKey = `FASTTRACK-${randomBytes(16).toString('hex')}`;
    const paymentReference = `SC-PAY-${randomBytes(12).toString('hex')}`;
    const initialized = await this.provider.initializePayment({ amount: this.fromMinor(BigInt(existingRequest.feeMinor)), currency: existingRequest.currency, idempotencyKey, bookingReference: reference, customerEmail: existingRequest.user.email, paymentReference, callbackUrl: this.callbackUrl(reference, true) });
    return this.bookings.manager.transaction(async (manager) => {
      const request = await manager.getRepository(FastTrackRequest).findOne({ where: { id: existingRequest.id, userId }, lock: { mode: 'pessimistic_write' } });
      if (!request || request.status !== FastTrackStatus.READY_FOR_PAYMENT) throw new ConflictException('FastTrack request is no longer ready for payment');
      const attemptRepo = manager.getRepository(PaymentAttempt);
      const raced = await attemptRepo.findOne({ where: { fastTrackRequestId: request.id, status: In([PaymentAttemptStatus.CREATED, PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, PaymentAttemptStatus.PENDING_CONFIRMATION]) } });
      if (raced) return this.fastTrackPaymentResponse(request, raced);
      const attempt = await attemptRepo.save(attemptRepo.create({ bookingFundingId: null, fastTrackRequestId: request.id, amount: this.fromMinor(BigInt(request.feeMinor)), currency: request.currency, status: initialized.status, idempotencyKey, providerCode: initialized.providerCode, providerReference: initialized.providerReference, checkoutUrl: initialized.checkoutUrl, accessCode: initialized.accessCode }));
      const from = request.status; request.status = FastTrackStatus.PAYMENT_PENDING; await manager.getRepository(FastTrackRequest).save(request);
      const history = manager.getRepository(FastTrackRequestStatusHistory); await history.save(history.create({ fastTrackRequestId: request.id, fromStatus: from, toStatus: request.status, actorUserId: userId, reasonCode: 'PAYMENT_INITIALIZED', reasonNote: null }));
      return this.fastTrackPaymentResponse(request, attempt);
    });
  }

  async getFastTrackPaymentStatus(reference: string, userId: string) {
    const request = await this.bookings.manager.getRepository(FastTrackRequest).findOne({ where: { reference, userId } });
    if (!request) throw new NotFoundException('FastTrack request was not found');
    const attempt = await this.attempts.findOne({ where: { fastTrackRequestId: request.id }, order: { createdAt: 'DESC' } });
    return this.fastTrackPaymentResponse(request, attempt);
  }

  async verifyFastTrackPayment(reference: string, userId: string) {
    const request = await this.bookings.manager.getRepository(FastTrackRequest).findOne({ where: { reference, userId } });
    if (!request) throw new NotFoundException('FastTrack request was not found');
    const attempt = await this.attempts.findOne({ where: { fastTrackRequestId: request.id }, order: { createdAt: 'DESC' } });
    if (!attempt) throw new ConflictException('No FastTrack payment attempt is available to verify');
    if (attempt.status !== PaymentAttemptStatus.SUCCEEDED) {
      if (!attempt.providerReference) throw new ConflictException('Payment attempt has no provider reference');
      await this.claimVerification(attempt.id);
      const verified = await this.provider.verifyPayment(attempt.providerReference);
      await this.applyFastTrackVerification(attempt.id, userId, verified);
    }
    return this.getFastTrackPaymentStatus(reference, userId);
  }

  private async applyFastTrackVerification(attemptId: string, actorUserId: string | null, verified: VerifyPaymentResult) {
    return this.bookings.manager.transaction(async (manager) => {
      const attemptRepo = manager.getRepository(PaymentAttempt);
      const attempt = await attemptRepo.findOne({ where: { id: attemptId }, lock: { mode: 'pessimistic_write' } });
      if (!attempt?.fastTrackRequestId) throw new NotFoundException('FastTrack payment attempt was not found');
      const requestRepo = manager.getRepository(FastTrackRequest);
      const request = await requestRepo.findOne({ where: { id: attempt.fastTrackRequestId }, lock: { mode: 'pessimistic_write' } });
      if (!request) throw new NotFoundException('FastTrack request was not found');
      if (attempt.status === PaymentAttemptStatus.SUCCEEDED) return this.fastTrackPaymentResponse(request, attempt);
      if (![FastTrackStatus.READY_FOR_PAYMENT, FastTrackStatus.PAYMENT_PENDING].includes(request.status)) throw new ConflictException('FastTrack request is no longer payable');
      const expectedAmount = this.fromMinor(BigInt(request.feeMinor));
      if (verified.providerReference !== attempt.providerReference || verified.amount !== attempt.amount || verified.currency !== attempt.currency || attempt.amount !== expectedAmount || attempt.currency !== request.currency) { attempt.status = PaymentAttemptStatus.FAILED; await attemptRepo.save(attempt); return this.fastTrackPaymentResponse(request, attempt); }
      if (!verified.succeeded || verified.status !== PaymentAttemptStatus.SUCCEEDED) { attempt.status = verified.status; await attemptRepo.save(attempt); return this.fastTrackPaymentResponse(request, attempt); }
      const transactions = manager.getRepository(PaymentTransaction);
      const duplicate = await transactions.findOne({ where: { providerReference: verified.providerReference } });
      if (duplicate && duplicate.paymentAttemptId !== attempt.id) throw new ConflictException('Verified provider transaction belongs to another payment attempt');
      if (!duplicate) await transactions.save(transactions.create({ paymentAttemptId: attempt.id, parentTransactionId: null, transactionType: PaymentTransactionType.COLLECTION, status: PaymentTransactionStatus.SUCCEEDED, amount: verified.amount, currency: verified.currency, providerReference: verified.providerReference, occurredAt: verified.occurredAt }));
      attempt.status = PaymentAttemptStatus.SUCCEEDED; await attemptRepo.save(attempt);
      const history = manager.getRepository(FastTrackRequestStatusHistory);
      const from = request.status; request.status = FastTrackStatus.PAID; request.paidAt = verified.occurredAt; await requestRepo.save(request); await history.save(history.create({ fastTrackRequestId: request.id, fromStatus: from, toStatus: FastTrackStatus.PAID, actorUserId, reasonCode: 'PAYMENT_CONFIRMED', reasonNote: null }));
      request.status = FastTrackStatus.CONFIRMED; request.confirmedAt = new Date(); await requestRepo.save(request); await history.save(history.create({ fastTrackRequestId: request.id, fromStatus: FastTrackStatus.PAID, toStatus: FastTrackStatus.CONFIRMED, actorUserId: null, reasonCode: 'AUTOMATIC_CONFIRMATION_AFTER_PAYMENT', reasonNote: null }));
      return this.fastTrackPaymentResponse(request, attempt);
    });
  }

  private fastTrackPaymentResponse(request: FastTrackRequest, attempt: PaymentAttempt | null) { return { fastTrackReference: request.reference, fastTrackStatus: request.status, feeMinor: Number(request.feeMinor), amount: this.fromMinor(BigInt(request.feeMinor)), currency: request.currency, paymentReady: request.status === FastTrackStatus.READY_FOR_PAYMENT, paymentAttemptStatus: attempt?.status ?? null, paymentReference: attempt?.providerReference ?? null, checkoutUrl: attempt?.checkoutUrl ?? null, accessCode: attempt?.accessCode ?? null, paidAt: request.paidAt }; }

  async getPublicPaymentStatus(
    reference: string,
  ): Promise<PublicPaymentStatusResponseDto> {
    const context = await this.latestPaymentContext(reference);
    return this.publicStatus(
      context.booking,
      context.funding,
      context.attempt,
      context.paidAt,
      context.redemption,
    );
  }


  private async ensureMatchingStarted(booking: Booking): Promise<void> {
    if (!this.matching || booking.status !== BookingStatus.PENDING_PROVIDER_MATCH) return;
    try {
      await this.matching.startMatching(booking.bookingReference, null);
    } catch {
      this.logger.error(`Provider matching recovery failed for booking ${booking.bookingReference}`);
    }
  }

  async verifyLatestBookingPayment(
    reference: string,
    actorUserId: string | null = null,
  ): Promise<PublicPaymentStatusResponseDto> {
    const context = await this.latestPaymentContext(reference);
    if (!context.attempt)
      throw new ConflictException("No payment attempt is available to verify");
    if (context.attempt.status === PaymentAttemptStatus.SUCCEEDED) {
      await this.ensureMatchingStarted(context.booking);
      return this.getPublicPaymentStatus(reference);
    }
    if (!context.attempt.providerReference)
      throw new ConflictException("Payment attempt has no provider reference");
    await this.claimVerification(context.attempt.id);
    const verified = await this.provider.verifyPayment(context.attempt.providerReference);
    await this.applyVerification(context.attempt.id, actorUserId, verified);
    return this.getPublicPaymentStatus(reference);
  }

private async applyVerification(
  attemptId: string,
  actorUserId: string | null,
  verified: VerifyPaymentResult,
): Promise<PaymentOperationResponseDto> {
  let settledBookingReference: string | null = null;
  const response = await this.bookings.manager.transaction(async (manager) => {
    const attemptRepository = manager.getRepository(PaymentAttempt);
    const fundingRepository = manager.getRepository(BookingFunding);
    const bookingRepository = manager.getRepository(Booking);

    // Lock only the payment attempt row.
    const attempt = await attemptRepository.findOne({
      where: { id: attemptId },
      lock: { mode: "pessimistic_write" },
    });

    if (!attempt) {
      throw new NotFoundException("Payment attempt not found");
    }
    if (!attempt.bookingFundingId) throw new ConflictException('Payment attempt does not belong to booking funding');

    // Lock the funding row separately.
    const funding = await fundingRepository.findOne({
      where: { id: attempt.bookingFundingId },
      lock: { mode: "pessimistic_write" },
    });

    if (!funding) {
      throw new NotFoundException("Booking funding not found");
    }

    // Lock the booking separately too.
    const booking = await bookingRepository.findOne({
      where: { id: funding.bookingId },
      lock: { mode: "pessimistic_write" },
    });

    if (!booking) {
      throw new NotFoundException("Booking not found");
    }
    if (booking.commercialProviderId === null || booking.commercialProviderServiceId === null) throw new ConflictException('Booking requires provider commercial binding before settlement');
    const redemption = await this.findRedemption(manager, booking.id, true);


    if (attempt.status === PaymentAttemptStatus.SUCCEEDED) {
      if (booking.status === BookingStatus.PENDING_PROVIDER_MATCH)
        settledBookingReference = booking.bookingReference;
      return this.response(booking, funding, attempt);
    }

    if (booking.status !== BookingStatus.AWAITING_FUNDING) {
      throw new ConflictException(
        "Booking is no longer awaiting funding",
      );
    }

    if (
      verified.providerReference !== attempt.providerReference ||
      verified.amount !== attempt.amount ||
      verified.currency !== attempt.currency ||
      attempt.amount !== funding.amount ||
      attempt.currency !== funding.currency ||
      (redemption && (!booking.quotedAmount || redemption.currency !== funding.currency || this.toMinor(booking.quotedAmount) !== this.toMinor(funding.amount!) + BigInt(redemption.amountMinor)))
    ) {
      attempt.status = PaymentAttemptStatus.FAILED;
      await attemptRepository.save(attempt);

      return this.response(booking, funding, attempt);
    }

    if (
      !verified.succeeded ||
      verified.status !== PaymentAttemptStatus.SUCCEEDED
    ) {
      attempt.status = verified.status;
      await attemptRepository.save(attempt);

      return this.response(booking, funding, attempt);
    }

    const transactions = manager.getRepository(PaymentTransaction);

    const duplicate = await transactions.findOne({
      where: {
        providerReference: verified.providerReference,
      },
    });

    if (duplicate && duplicate.paymentAttemptId !== attempt.id) {
      throw new ConflictException(
        "Verified provider transaction is already associated with another payment attempt",
      );
    }

    let collectionTransaction = duplicate;
    if (!collectionTransaction) {
      collectionTransaction = await transactions.save(
        transactions.create({
          paymentAttemptId: attempt.id,
          parentTransactionId: null,
          transactionType: PaymentTransactionType.COLLECTION,
          status: PaymentTransactionStatus.SUCCEEDED,
          amount: verified.amount,
          currency: verified.currency,
          providerReference: verified.providerReference,
          occurredAt: verified.occurredAt,
        }),
      );
    }

    if (this.earnings) await this.earnings.createHeldHealthCheckEarning(manager, booking, collectionTransaction);

    attempt.status = PaymentAttemptStatus.SUCCEEDED;
    await attemptRepository.save(attempt);

    if (redemption) {
      await manager.getRepository(User).findOne({ where: { id: redemption.userId }, lock: { mode: "pessimistic_write" } });
      await this.settleRedemption(manager, redemption);
    }

    funding.status = BookingFundingStatus.SETTLED;
    await fundingRepository.save(funding);

    const fromStatus = booking.status;

    booking.status = BookingStatus.PENDING_PROVIDER_MATCH;
    await bookingRepository.save(booking);

    const historyRepository =
      manager.getRepository(BookingStatusHistory);

    await historyRepository.save(
      historyRepository.create({
        bookingId: booking.id,
        fromStatus,
        toStatus: BookingStatus.PENDING_PROVIDER_MATCH,
        actorUserId,
        reasonCode: "SELF_PAYMENT_CONFIRMED",
        reasonNote: null,
      }),
    );

    settledBookingReference = booking.bookingReference;

    return this.response(booking, funding, attempt);
  });
  if (settledBookingReference && this.matching) {
    try {
      await this.matching.startMatching(settledBookingReference, null);
    } catch {
      this.logger.error(`Automatic provider matching failed after payment settlement for booking ${settledBookingReference}`);
    }
  }
  return response;
}
  private async requireFunding(reference: string): Promise<BookingFunding> {
    const funding = await this.bookings.manager
      .getRepository(BookingFunding)
      .findOne({
        where: {
          booking: { bookingReference: reference },
          sourceType: BookingFundingSourceType.SELF,
        },
        relations: { booking: true, responsibleUser: true, payerContact: true },
      });
    if (!funding)
      throw new NotFoundException("Self-funding obligation not found");
    if (funding.booking.status !== BookingStatus.AWAITING_FUNDING)
      throw new ConflictException("Booking is not awaiting funding");
    if (!funding.amount)
      throw new ConflictException("Funding obligation has no fixed amount");
    return funding;
  }
  private async latestPaymentContext(reference: string) {
    const booking = await this.bookings.findOne({
      where: { bookingReference: reference },
    });
    if (!booking) throw new NotFoundException("Booking not found");
    const funding = await this.bookings.manager
      .getRepository(BookingFunding)
      .findOne({
        where: {
          bookingId: booking.id,
          sourceType: BookingFundingSourceType.SELF,
        },
      });
    const attempt = funding
      ? await this.attempts.findOne({
          where: { bookingFundingId: funding.id },
          order: { createdAt: "DESC" },
        })
      : null;
    const transaction =
      attempt && attempt.status === PaymentAttemptStatus.SUCCEEDED
        ? await this.bookings.manager
            .getRepository(PaymentTransaction)
            .findOne({
              where: {
                paymentAttemptId: attempt.id,
                status: PaymentTransactionStatus.SUCCEEDED,
              },
              order: { createdAt: "DESC" },
            })
        : null;
    const redemptionRepository = this.bookings.manager.getRepository(RewardBookingRedemption);
    const redemption = typeof redemptionRepository.findOne === "function" ? await redemptionRepository.findOne({ where: { bookingId: booking.id }, order: { createdAt: "DESC" } }) : null;
    return {
      booking,
      funding,
      attempt,
      paidAt: transaction?.occurredAt ?? null,
      redemption,
    };
  }
  private async claimVerification(attemptId: string): Promise<void> {
    await this.bookings.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PaymentAttempt);
      const attempt = await repository.findOne({
        where: { id: attemptId },
        lock: { mode: "pessimistic_write" },
      });
      if (!attempt) throw new NotFoundException("Payment attempt not found");
      const intervalMs =
        (this.config?.payments.verificationMinIntervalSeconds ?? 30) * 1000;
      if (
        attempt.lastVerifiedAt &&
        Date.now() - attempt.lastVerifiedAt.getTime() < intervalMs
      )
        throw new HttpException(
          "Payment status was verified recently; retry later",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      attempt.lastVerifiedAt = new Date();
      await repository.save(attempt);
    });
  }
  private publicStatus(
    booking: Booking,
    funding: BookingFunding | null,
    attempt: PaymentAttempt | null,
    paidAt: Date | null,
    redemption: RewardBookingRedemption | null,
  ): PublicPaymentStatusResponseDto {
    return {
      bookingReference: booking.bookingReference,
      bookingStatus: booking.status,
      fundingStatus: funding?.status ?? null,
      checkoutOption: funding?.checkoutOption ?? null,
      paymentStatus: attempt?.status ?? null,
      paymentAttemptReference: attempt?.providerReference ?? null,
      amount: funding?.amount ?? booking.quotedAmount ?? null,
      currency: funding?.currency ?? booking.currency ?? null,
      paidAt,
      bookingTotal: booking.quotedAmount ?? null,
      pointsReserved: redemption?.pointsReserved ?? 0,
      pointsAmount: redemption ? this.fromMinor(BigInt(redemption.amountMinor)) : "0.00",
      remainingExternalAmount: funding?.amount ?? booking.quotedAmount ?? null,
      redemptionStatus: redemption?.status ?? null,
    };
  }
  private response(
    booking: Booking,
    funding: BookingFunding,
    attempt: PaymentAttempt | null,
  ): PaymentOperationResponseDto {
    return {
      bookingReference: booking.bookingReference,
      fundingStatus: funding.status,
      checkoutOption: funding.checkoutOption,
      attemptId: attempt?.id ?? null,
      attemptStatus: attempt?.status ?? null,
      amount: funding.amount!,
      currency: funding.currency,
      paymentReference: attempt?.providerReference ?? null,
      checkoutUrl: attempt?.checkoutUrl ?? null,
      accessCode: attempt?.accessCode ?? null,
    };
  }

  private callbackUrl(reference: string, patient: boolean): string | undefined {
    const base = patient
      ? this.config?.payments.paystack.patientCallbackUrl ?? this.config?.payments.paystack.callbackUrl
      : this.config?.payments.paystack.callbackUrl;
    return base ? `${base}${encodeURIComponent(reference)}` : undefined;
  }

  private async settleRedemption(manager: import("typeorm").EntityManager, redemption: RewardBookingRedemption) {
    const eventKey = `HEALTH_CHECK_REDEMPTION:${redemption.bookingId}`;
    const ledger = manager.getRepository(RewardPointsLedger);
    if (!(await ledger.exists({ where: { eventKey } }))) await ledger.save(ledger.create({ userId: redemption.userId, referralId: null, eventKey, eventType: "HEALTH_CHECK_REDEMPTION", direction: RewardLedgerDirection.DEBIT, points: redemption.pointsReserved, reasonCode: "HEALTH_CHECK_REDEMPTION" }));
    redemption.status = RewardBookingRedemptionStatus.SETTLED; redemption.settledAt = new Date();
    await manager.getRepository(RewardBookingRedemption).save(redemption);
  }

  private async hasActiveAttempt(manager: import("typeorm").EntityManager, fundingId: string) {
    return manager.getRepository(PaymentAttempt).exists({ where: { bookingFundingId: fundingId, status: In([PaymentAttemptStatus.CREATED, PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, PaymentAttemptStatus.PENDING_CONFIRMATION]) } });
  }

  private async findRedemption(manager: import("typeorm").EntityManager, bookingId: string, lock: boolean) {
    const repository = manager.getRepository(RewardBookingRedemption);
    if (typeof repository.findOne !== "function") return null;
    return repository.findOne({ where: { bookingId, status: RewardBookingRedemptionStatus.RESERVED }, ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}) });
  }

  private async startMatchingAfterSettlement(reference: string) {
    if (!this.matching) return;
    try { await this.matching.startMatching(reference, null); }
    catch { this.logger.error(`Automatic provider matching failed after combined funding settlement for booking ${reference}`); }
  }

  private toMinor(value: string) { const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value); if (!match) throw new ConflictException("Configured monetary amount is invalid"); return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")); }
  private fromMinor(value: bigint) { return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`; }
  private redemptionView(redemption: RewardBookingRedemption, totalMinor: bigint) { return { pointsReserved: redemption.pointsReserved, pointsAmount: this.fromMinor(BigInt(redemption.amountMinor)), remainingExternalAmount: this.fromMinor(totalMinor - BigInt(redemption.amountMinor)), currency: redemption.currency, status: redemption.status }; }
}
