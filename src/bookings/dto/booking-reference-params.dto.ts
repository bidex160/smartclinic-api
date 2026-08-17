import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const BOOKING_REFERENCE_PATTERN = /^SC-\d{4}-[A-F0-9]{12}$/;

export class BookingReferenceParamsDto {
  @ApiProperty({ example: 'SC-2026-7F23B0C9D1E4' })
  @Matches(BOOKING_REFERENCE_PATTERN, {
    message: 'reference must be a valid SmartClinic booking reference',
  })
  reference!: string;
}
