import { Booking } from '../bookings/entities/booking.entity';
import { AvailabilityWindow } from './provider-capabilities.service';

export type BookingAvailabilityContextResult =
  | { ready: true; window: AvailabilityWindow }
  | { ready: false; reason: 'INCOMPLETE_SCHEDULING_CONTEXT' | 'INVALID_PACKAGE_DURATION'; missingFields: string[] };

export function deriveAppointmentEndTime(startTime: string, durationMinutes: number): string | null {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + durationMinutes;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || endMinutes >= 24 * 60) return null;
  return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
}

export function bookingToAvailabilityWindow(booking: Booking): BookingAvailabilityContextResult {
  const missingFields = [
    !booking.preferredDate && 'preferredDate',
    !booking.preferredTimeWindowStart && 'preferredTimeWindowStart',
    !booking.preferredTimezone && 'preferredTimezone',
  ].filter((field): field is string => Boolean(field));

  if (missingFields.length) return { ready: false, reason: 'INCOMPLETE_SCHEDULING_CONTEXT', missingFields };
  const duration = booking.healthCheckPackage?.estimatedDurationMinutes;
  const derivedEnd = typeof duration === 'number' ? deriveAppointmentEndTime(booking.preferredTimeWindowStart!, duration) : null;
  if (!derivedEnd) return { ready: false, reason: 'INVALID_PACKAGE_DURATION', missingFields: ['healthCheckPackage.estimatedDurationMinutes'] };
  return {
    ready: true,
    window: {
      requestedDate: booking.preferredDate!,
      requestedStartTime: booking.preferredTimeWindowStart!,
      requestedEndTime: derivedEnd,
      requestedTimezone: booking.preferredTimezone!,
    },
  };
}
