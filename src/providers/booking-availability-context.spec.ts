import { Booking } from '../bookings/entities/booking.entity';
import { bookingToAvailabilityWindow } from './booking-availability-context';

describe('bookingToAvailabilityWindow', () => {
  it('creates eligibility input from a complete booking schedule', () => {
    expect(bookingToAvailabilityWindow({ preferredDate: '2026-08-24', preferredTimeWindowStart: '09:00', preferredTimeWindowEnd: null, preferredTimezone: 'Africa/Lagos', healthCheckPackage: { estimatedDurationMinutes: 30 } } as Booking)).toEqual({ ready: true, window: { requestedDate: '2026-08-24', requestedStartTime: '09:00', requestedEndTime: '09:30', requestedTimezone: 'Africa/Lagos' } });
  });
  it('returns a clear domain result for incomplete scheduling context', () => {
    expect(bookingToAvailabilityWindow({ preferredDate: '2026-08-24', preferredTimeWindowStart: null, preferredTimeWindowEnd: null, preferredTimezone: 'Africa/Lagos' } as Booking)).toEqual({ ready: false, reason: 'INCOMPLETE_SCHEDULING_CONTEXT', missingFields: ['preferredTimeWindowStart'] });
  });
  it('fails safely when package duration is unavailable', () => { expect(bookingToAvailabilityWindow({ preferredDate: '2026-08-24', preferredTimeWindowStart: '09:00', preferredTimezone: 'Africa/Lagos', healthCheckPackage: { estimatedDurationMinutes: null } } as Booking)).toMatchObject({ ready: false, reason: 'INVALID_PACKAGE_DURATION' }); });
});
