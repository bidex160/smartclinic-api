import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { BookingStatus } from '../enums/booking-status.enum';
import { Booking } from '../entities/booking.entity';

class BookingPackageResponseDto {
  @ApiProperty({ example: 'ESSENTIAL' })
  code!: string;

  @ApiProperty({ example: 'Essential Health Check' })
  name!: string;
}

class BookingFulfilmentModeResponseDto {
  @ApiProperty({ example: 'PROVIDER_LOCATION' })
  code!: string;

  @ApiProperty({ example: 'Provider location' })
  name!: string;
}

class BookingParticipantResponseDto {
  @ApiProperty({ example: 'Ada' })
  givenName!: string;

  @ApiProperty({ example: 'Okafor' })
  familyName!: string;
}

export class BookingResponseDto {
  @ApiProperty({
    example: 'SC-2026-7F23B0C9D1E4',
    description: 'Public booking reference. It is an identifier, not an authorisation secret.',
  })
  bookingReference!: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.DRAFT })
  status!: BookingStatus;

  @ApiProperty({ type: BookingPackageResponseDto })
  healthCheckPackage!: BookingPackageResponseDto;

  @ApiProperty({ type: BookingFulfilmentModeResponseDto })
  fulfilmentMode!: BookingFulfilmentModeResponseDto;

  @ApiProperty({ type: BookingParticipantResponseDto })
  participant!: BookingParticipantResponseDto;

  @ApiPropertyOptional({ example: '12500.00', nullable: true })
  quotedAmount!: string | null;

  @ApiPropertyOptional({ example: 'NGN', nullable: true, description: 'Currency selected by the server with the quoted amount.' })
  quotedCurrency!: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  preferredDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  preferredTimeWindowStart!: string | null;

  @ApiPropertyOptional({ nullable: true })
  preferredTimeWindowEnd!: string | null;

  @ApiPropertyOptional({ example: 'Africa/Lagos', nullable: true })
  preferredTimezone!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'The booking location preference supplied by the booker.',
  })
  locationNote!: string | null;
  @ApiPropertyOptional({ nullable: true }) visitAddressSummary!: { city: string; stateOrRegion: string; postalCode: string | null; countryCode: string } | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  static fromEntity(booking: Booking): BookingResponseDto {
    return {
      bookingReference: booking.bookingReference,
      status: booking.status,
      healthCheckPackage: {
        code: booking.healthCheckPackage.code,
        name: booking.healthCheckPackage.name,
      },
      fulfilmentMode: {
        code: booking.fulfilmentMode.code,
        name: booking.fulfilmentMode.name,
      },
      participant: {
        givenName: booking.participant.givenName,
        familyName: booking.participant.familyName,
      },
      quotedAmount: booking.quotedAmount,
      quotedCurrency: booking.currency,
      preferredDate: booking.preferredDate,
      preferredTimeWindowStart: booking.preferredTimeWindowStart,
      preferredTimeWindowEnd: booking.preferredTimeWindowEnd,
      preferredTimezone: booking.preferredTimezone,
      locationNote: booking.preferredLocationNote,
      visitAddressSummary: booking.visitAddress ? { city: booking.visitAddress.city, stateOrRegion: booking.visitAddress.stateOrRegion, postalCode: booking.visitAddress.postalCode, countryCode: booking.visitAddress.countryCode } : null,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}
