import { BadRequestException } from '@nestjs/common';
import { isTimeZone } from 'class-validator';

export interface BookingSchedulingPreference {
  preferredDate?: string | null;
  preferredTimeWindowStart?: string | null;
  preferredTimeWindowEnd?: string | null;
  preferredTimezone?: string | null;
}

export function validateBookingSchedulingPreference(value: BookingSchedulingPreference): void {
  const hasDate = value.preferredDate != null;
  const hasStart = value.preferredTimeWindowStart != null;
  if (!hasDate || !hasStart) throw new BadRequestException('preferred appointment requires date and start time');
  if (!value.preferredTimezone) throw new BadRequestException('preferredTimezone is required for the appointment start');
  if (value.preferredTimezone && !isTimeZone(value.preferredTimezone)) throw new BadRequestException('preferredTimezone must be a valid IANA timezone');
}
