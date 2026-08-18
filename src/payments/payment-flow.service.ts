import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingContact } from '../bookings/entities/booking-contact.entity';
import { BookingFunding } from '../bookings/entities/booking-funding.entity'; import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity'; import { Booking } from '../bookings/entities/booking.entity'; import { BookingFundingSourceType } from '../bookings/enums/booking-funding-source-type.enum'; import { BookingFundingStatus } from '../bookings/enums/booking-funding-status.enum'; import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { PaymentAttempt } from './entities/payment-attempt.entity'; import { PaymentTransaction } from './entities/payment-transaction.entity'; import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum'; import { PaymentTransactionStatus } from './enums/payment-transaction-status.enum'; import { PaymentTransactionType } from './enums/payment-transaction-type.enum'; import { PAYMENT_PROVIDER_ADAPTER, PaymentProviderAdapter, VerifyPaymentResult } from './payment-provider.adapter'; import { PaymentOperationResponseDto } from './dto/payment-operation-response.dto';

@Injectable()
export class PaymentFlowService {
  constructor(@InjectRepository(Booking) private readonly bookings: Repository<Booking>, @InjectRepository(PaymentAttempt) private readonly attempts: Repository<PaymentAttempt>, @Inject(PAYMENT_PROVIDER_ADAPTER) private readonly provider: PaymentProviderAdapter) {}

  async initializeFunding(reference: string, actorUserId: string | null): Promise<PaymentOperationResponseDto> {
    return this.bookings.manager.transaction(async (manager) => {
      const booking = await manager.getRepository(Booking).findOne({ where: { bookingReference: reference }, lock: { mode: 'pessimistic_write' } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (![BookingStatus.DRAFT, BookingStatus.AWAITING_FUNDING].includes(booking.status)) throw new ConflictException(`Booking in ${booking.status} cannot initialize funding`);
      if (!booking.quotedAmount || !booking.currency) throw new BadRequestException('Booking does not have a complete server quote');
      const payerContact = booking.bookerUserId ? null : await manager.getRepository(BookingContact).findOne({ where: { bookingId: booking.id } });
      if (!booking.bookerUserId && !payerContact) throw new ConflictException('Guest booking does not have a payer contact snapshot');
      const fundingRepository = manager.getRepository(BookingFunding);
      let funding = await fundingRepository.findOne({ where: { bookingId: booking.id, sourceType: BookingFundingSourceType.SELF }, lock: { mode: 'pessimistic_write' } });
      if (funding && (funding.amount !== booking.quotedAmount || funding.currency !== booking.currency)) throw new ConflictException('Existing funding obligation does not match the booking quote');
      if (!funding) funding = await fundingRepository.save(fundingRepository.create({ bookingId: booking.id, sourceType: BookingFundingSourceType.SELF, responsibleUserId: booking.bookerUserId, responsibleOrganisationId: null, payerContactId: payerContact?.id ?? null, amount: booking.quotedAmount, percentage: null, currency: booking.currency, status: BookingFundingStatus.PENDING }));
      if (booking.status === BookingStatus.DRAFT) { booking.status = BookingStatus.AWAITING_FUNDING; await manager.getRepository(Booking).save(booking); const history = manager.getRepository(BookingStatusHistory); await history.save(history.create({ bookingId: booking.id, fromStatus: BookingStatus.DRAFT, toStatus: BookingStatus.AWAITING_FUNDING, actorUserId, reasonCode: 'SELF_FUNDING_INITIALIZED', reasonNote: null })); }
      return this.response(booking, funding, null);
    });
  }

  async initiatePayment(reference: string, idempotencyKey: string): Promise<PaymentOperationResponseDto> {
    const existing = await this.attempts.findOne({ where: { idempotencyKey }, relations: { bookingFunding: { booking: true } } });
    if (existing) { if (existing.bookingFunding.booking.bookingReference !== reference) throw new ConflictException('Idempotency key belongs to a different booking'); return this.response(existing.bookingFunding.booking, existing.bookingFunding, existing); }
    const funding = await this.requireFunding(reference);
    const initialized = await this.provider.initializePayment({ amount: funding.amount!, currency: funding.currency, idempotencyKey, bookingReference: reference });
    return this.bookings.manager.transaction(async (manager) => {
      const attemptRepository = manager.getRepository(PaymentAttempt);
      const raced = await attemptRepository.findOne({ where: { idempotencyKey } });
      if (raced) return this.response(funding.booking, funding, raced);
      const attempt = await attemptRepository.save(attemptRepository.create({ bookingFundingId: funding.id, amount: funding.amount!, currency: funding.currency, status: initialized.status, idempotencyKey, providerCode: initialized.providerCode, providerReference: initialized.providerReference }));
      return this.response(funding.booking, funding, attempt);
    });
  }

  async confirmPayment(attemptId: string, actorUserId: string): Promise<PaymentOperationResponseDto> {
    const current = await this.attempts.findOne({ where: { id: attemptId }, relations: { bookingFunding: { booking: true } } });
    if (!current) throw new NotFoundException('Payment attempt not found');
    if (current.status === PaymentAttemptStatus.SUCCEEDED) return this.response(current.bookingFunding.booking, current.bookingFunding, current);
    if (!current.providerReference) throw new ConflictException('Payment attempt has no provider reference');
    const verified = await this.provider.verifyPayment(current.providerReference);
    return this.applyVerification(attemptId, actorUserId, verified);
  }

  private async applyVerification(attemptId: string, actorUserId: string, verified: VerifyPaymentResult): Promise<PaymentOperationResponseDto> {
    return this.bookings.manager.transaction(async (manager) => {
      const attemptRepository = manager.getRepository(PaymentAttempt); const fundingRepository = manager.getRepository(BookingFunding); const bookingRepository = manager.getRepository(Booking);
      const attempt = await attemptRepository.findOne({ where: { id: attemptId }, relations: { bookingFunding: { booking: true } }, lock: { mode: 'pessimistic_write' } });
      if (!attempt) throw new NotFoundException('Payment attempt not found');
      const funding = attempt.bookingFunding; const booking = funding.booking;
      if (attempt.status === PaymentAttemptStatus.SUCCEEDED) return this.response(booking, funding, attempt);
      if (booking.status !== BookingStatus.AWAITING_FUNDING) throw new ConflictException('Booking is no longer awaiting funding');
      if (!verified.succeeded || verified.providerReference !== attempt.providerReference || verified.amount !== attempt.amount || verified.currency !== attempt.currency || attempt.amount !== funding.amount || attempt.currency !== funding.currency) { attempt.status = PaymentAttemptStatus.FAILED; await attemptRepository.save(attempt); return this.response(booking, funding, attempt); }
      const transactions = manager.getRepository(PaymentTransaction);
      const duplicate = await transactions.findOne({ where: { providerReference: verified.providerReference } });
      if (duplicate && duplicate.paymentAttemptId !== attempt.id) throw new ConflictException('Verified provider transaction is already associated with another payment attempt');
      if (!duplicate) await transactions.save(transactions.create({ paymentAttemptId: attempt.id, parentTransactionId: null, transactionType: PaymentTransactionType.COLLECTION, status: PaymentTransactionStatus.SUCCEEDED, amount: verified.amount, currency: verified.currency, providerReference: verified.providerReference, occurredAt: verified.occurredAt }));
      attempt.status = PaymentAttemptStatus.SUCCEEDED; await attemptRepository.save(attempt); funding.status = BookingFundingStatus.SETTLED; await fundingRepository.save(funding);
      const fromStatus = booking.status; booking.status = BookingStatus.PENDING_PROVIDER_MATCH; await bookingRepository.save(booking); const history = manager.getRepository(BookingStatusHistory); await history.save(history.create({ bookingId: booking.id, fromStatus, toStatus: BookingStatus.PENDING_PROVIDER_MATCH, actorUserId, reasonCode: 'SELF_PAYMENT_CONFIRMED', reasonNote: null }));
      return this.response(booking, funding, attempt);
    });
  }
  private async requireFunding(reference: string): Promise<BookingFunding> { const funding = await this.bookings.manager.getRepository(BookingFunding).findOne({ where: { booking: { bookingReference: reference }, sourceType: BookingFundingSourceType.SELF }, relations: { booking: true } }); if (!funding) throw new NotFoundException('Self-funding obligation not found'); if (funding.booking.status !== BookingStatus.AWAITING_FUNDING) throw new ConflictException('Booking is not awaiting funding'); if (!funding.amount) throw new ConflictException('Funding obligation has no fixed amount'); return funding; }
  private response(booking: Booking, funding: BookingFunding, attempt: PaymentAttempt | null): PaymentOperationResponseDto { return { bookingReference: booking.bookingReference, fundingStatus: funding.status, attemptId: attempt?.id ?? null, attemptStatus: attempt?.status ?? null, amount: funding.amount!, currency: funding.currency, paymentReference: attempt?.providerReference ?? null }; }
}
