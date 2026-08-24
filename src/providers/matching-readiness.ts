import { BookingFunding } from '../bookings/entities/booking-funding.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingFundingStatus } from '../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { MatchingQueueReadiness } from './enums/matching-queue-readiness.enum';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';

export function deriveMatchingReadiness(booking: Booking, funding: BookingFunding | null, assignment: ProviderAssignment | null): MatchingQueueReadiness {
  if (booking.status === BookingStatus.PROVIDER_ASSIGNED || assignment?.status === ProviderAssignmentStatus.CONFIRMED) return MatchingQueueReadiness.ALREADY_ASSIGNED;
  if (booking.status === BookingStatus.UNFULFILLABLE) return MatchingQueueReadiness.UNFULFILLABLE;
  if (assignment?.status === ProviderAssignmentStatus.ACCEPTED) return MatchingQueueReadiness.ACCEPTED_AWAITING_CONFIRMATION;
  if (assignment?.status === ProviderAssignmentStatus.OFFERED) return MatchingQueueReadiness.ACTIVE_OFFER;
  if (funding?.status !== BookingFundingStatus.SETTLED) return MatchingQueueReadiness.FUNDING_INCOMPLETE;
  if (!booking.preferredDate || !booking.preferredTimeWindowStart || !booking.preferredTimezone || !booking.healthCheckPackage?.estimatedDurationMinutes || booking.healthCheckPackage.estimatedDurationMinutes <= 0) return MatchingQueueReadiness.INCOMPLETE_SCHEDULING;
  return MatchingQueueReadiness.READY;
}
