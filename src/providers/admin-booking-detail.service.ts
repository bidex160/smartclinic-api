import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingFunding } from '../bookings/entities/booking-funding.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingFundingSourceType } from '../bookings/enums/booking-funding-source-type.enum';
import { PaymentAttempt } from '../payments/entities/payment-attempt.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { PaymentTransactionStatus } from '../payments/enums/payment-transaction-status.enum';
import { AdminBookingDetailResponseDto } from './dto/admin-booking-detail-response.dto';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { deriveMatchingReadiness } from './matching-readiness';

@Injectable()
export class AdminBookingDetailService {
  constructor(@InjectRepository(Booking) private readonly bookings: Repository<Booking>, @InjectRepository(BookingFunding) private readonly funding: Repository<BookingFunding>, @InjectRepository(PaymentAttempt) private readonly attempts: Repository<PaymentAttempt>, @InjectRepository(PaymentTransaction) private readonly transactions: Repository<PaymentTransaction>, @InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>) {}

  async get(reference: string): Promise<AdminBookingDetailResponseDto> {
    const booking = await this.bookings.findOne({ where: { bookingReference: reference }, relations: { healthCheckPackage: true, fulfilmentMode: true, participant: true, contact: true, booker: true, providerLocation: true, visitAddress: true } });
    if (!booking) throw new NotFoundException('Booking not found');
    const funding = await this.funding.findOne({ where: { bookingId: booking.id, sourceType: BookingFundingSourceType.SELF } });
    const attempt = funding ? await this.attempts.findOne({ where: { bookingFundingId: funding.id }, order: { createdAt: 'DESC', id: 'DESC' } }) : null;
    const transaction = attempt ? await this.transactions.findOne({ where: { paymentAttemptId: attempt.id, status: PaymentTransactionStatus.SUCCEEDED }, order: { createdAt: 'DESC', id: 'DESC' } }) : null;
    const assignment = await this.assignments.findOne({ where: { bookingId: booking.id }, relations: { provider: true }, order: { createdAt: 'DESC', id: 'DESC' } });
    const guestContact = booking.contact;
    return {
      bookingReference: booking.bookingReference, status: booking.status, createdAt: booking.createdAt, updatedAt: booking.updatedAt,
      package: { code: booking.healthCheckPackage.code, name: booking.healthCheckPackage.name }, fulfilmentMode: { code: booking.fulfilmentMode.code, name: booking.fulfilmentMode.name }, participant: { givenName: booking.participant.givenName, familyName: booking.participant.familyName },
      bookerContact: { givenName: guestContact?.givenName ?? null, familyName: guestContact?.familyName ?? null, email: guestContact?.email ?? booking.booker?.email ?? null, phone: guestContact?.phone ?? null },
      preferredDate: booking.preferredDate, preferredTimeFrom: booking.preferredTimeWindowStart, preferredTimeTo: booking.preferredTimeWindowEnd, preferredTimezone: booking.preferredTimezone, locationNote: booking.preferredLocationNote, visitAddress: booking.visitAddress ? { addressLine1: booking.visitAddress.addressLine1, addressLine2: booking.visitAddress.addressLine2, city: booking.visitAddress.city, stateOrRegion: booking.visitAddress.stateOrRegion, postalCode: booking.visitAddress.postalCode, countryCode: booking.visitAddress.countryCode } : null,
      confirmedSchedule: booking.scheduledDate ? { date: booking.scheduledDate, timeFrom: booking.scheduledTimeFrom!, timeTo: booking.scheduledTimeTo!, timezone: booking.scheduledTimezone!, scheduledAt: booking.scheduledAt!, providerLocation: booking.providerLocation ? { id: booking.providerLocation.id, name: booking.providerLocation.name, addressLine1: booking.providerLocation.addressLine1, addressLine2: booking.providerLocation.addressLine2, city: booking.providerLocation.city, state: booking.providerLocation.state, postalCode: booking.providerLocation.postalCode, countryCode: booking.providerLocation.countryCode } : null } : null,
      quotedAmount: booking.quotedAmount, quotedCurrency: booking.currency,
      funding: { fundingStatus: funding?.status ?? null, fundingType: funding?.sourceType ?? null, checkoutOption: funding?.checkoutOption ?? null, amount: funding?.amount ?? null, currency: funding?.currency ?? null },
      payment: { status: attempt?.status ?? null, paymentReference: attempt?.providerReference ?? null, paidAt: transaction?.occurredAt ?? null },
      assignment: { assignmentId: assignment?.id ?? null, assignmentStatus: assignment?.status ?? null, providerId: assignment?.providerId ?? null, providerName: assignment?.provider?.displayName ?? null, offeredAt: assignment?.offeredAt ?? null, acceptedAt: assignment?.acceptedAt ?? null, confirmedAt: assignment?.confirmedAt ?? null, expiresAt: assignment?.expiresAt ?? null },
      readiness: deriveMatchingReadiness(booking, funding, assignment),
    };
  }
}
