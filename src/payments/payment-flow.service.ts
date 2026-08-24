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
  ) {}

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
      let funding = await fundingRepository.findOne({
        where: {
          bookingId: booking.id,
          sourceType: BookingFundingSourceType.SELF,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (
        funding &&
        (funding.amount !== booking.quotedAmount ||
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
            amount: booking.quotedAmount,
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
  ): Promise<PaymentOperationResponseDto> {
    const existing = await this.attempts.findOne({
      where: { idempotencyKey },
      relations: { bookingFunding: { booking: true } },
    });
    if (existing) {
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
    return this.initiatePayment(
      reference,
      `PUBLIC-${randomBytes(16).toString("hex")}`,
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
    if (current.status === PaymentAttemptStatus.SUCCEEDED)
      return this.response(
        current.bookingFunding.booking,
        current.bookingFunding,
        current,
      );
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
    return this.applyVerification(attempt.id, null, verified);
  }

  async getPublicPaymentStatus(
    reference: string,
  ): Promise<PublicPaymentStatusResponseDto> {
    const context = await this.latestPaymentContext(reference);
    return this.publicStatus(
      context.booking,
      context.funding,
      context.attempt,
      context.paidAt,
    );
  }

  async verifyLatestBookingPayment(
    reference: string,
  ): Promise<PublicPaymentStatusResponseDto> {
    const context = await this.latestPaymentContext(reference);
    if (!context.attempt)
      throw new ConflictException("No payment attempt is available to verify");
    if (context.attempt.status === PaymentAttemptStatus.SUCCEEDED)
      return this.publicStatus(
        context.booking,
        context.funding,
        context.attempt,
        context.paidAt,
      );
    if (!context.attempt.providerReference)
      throw new ConflictException("Payment attempt has no provider reference");
    await this.claimVerification(context.attempt.id);
    const verified = await this.provider.verifyPayment(
      context.attempt.providerReference,
    );
    await this.applyVerification(context.attempt.id, null, verified);
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

    if (attempt.status === PaymentAttemptStatus.SUCCEEDED) {
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
      attempt.currency !== funding.currency
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

    if (!duplicate) {
      await transactions.save(
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

    attempt.status = PaymentAttemptStatus.SUCCEEDED;
    await attemptRepository.save(attempt);

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
    return {
      booking,
      funding,
      attempt,
      paidAt: transaction?.occurredAt ?? null,
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
}
