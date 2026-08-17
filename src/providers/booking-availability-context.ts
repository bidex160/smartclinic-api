import { Booking } from '../bookings/entities/booking.entity';
import { AvailabilityWindow } from './provider-capabilities.service';

export type BookingAvailabilityContextResult =
  | { ready: true; window: AvailabilityWindow }
  | { ready: false; reason: 'INCOMPLETE_SCHEDULING_CONTEXT'; missingFields: string[] };

export function bookingToAvailabilityWindow(booking: Booking): BookingAvailabilityContextResult {
  const missingFields = [
    !booking.preferredDate && 'preferredDate',
    !booking.preferredTimeWindowStart && 'preferredTimeWindowStart',
    !booking.preferredTimeWindowEnd && 'preferredTimeWindowEnd',
    !booking.preferredTimezone && 'preferredTimezone',
  ].filter((field): field is string => Boolean(field));

  if (missingFields.length) return { ready: false, reason: 'INCOMPLETE_SCHEDULING_CONTEXT', missingFields };
  return {
    ready: true,
    window: {
      requestedDate: booking.preferredDate!,
      requestedStartTime: booking.preferredTimeWindowStart!,
      requestedEndTime: booking.preferredTimeWindowEnd!,
      requestedTimezone: booking.preferredTimezone!,
    },
  };
}
