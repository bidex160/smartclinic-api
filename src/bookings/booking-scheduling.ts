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
  const hasEnd = value.preferredTimeWindowEnd != null;
  const hasSchedule = hasDate || hasStart || hasEnd;

  if (hasStart !== hasEnd) throw new BadRequestException('preferred time window requires both start and end');
  if (hasStart && value.preferredTimeWindowEnd! <= value.preferredTimeWindowStart!) throw new BadRequestException('preferred time window end must be after start');
  if (hasSchedule && !value.preferredTimezone) throw new BadRequestException('preferredTimezone is required when a scheduling preference is supplied');
  if (value.preferredTimezone && !isTimeZone(value.preferredTimezone)) throw new BadRequestException('preferredTimezone must be a valid IANA timezone');
}
