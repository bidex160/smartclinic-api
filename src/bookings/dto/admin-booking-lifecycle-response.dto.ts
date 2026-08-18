import { ApiProperty } from '@nestjs/swagger';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';

export class AdminBookingLifecycleResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiProperty({ format: 'date', nullable: true }) preferredDate!: string | null;
  @ApiProperty({ nullable: true }) preferredTimeFrom!: string | null;
  @ApiProperty({ nullable: true }) preferredTimeTo!: string | null;
  @ApiProperty({ nullable: true }) preferredTimezone!: string | null;
  @ApiProperty() cancelledAssignmentCount!: number;
  @ApiProperty() releasedReservationCount!: number;

  static fromEntity(booking: Booking, cancelledAssignmentCount: number, releasedReservationCount: number): AdminBookingLifecycleResponseDto {
    return { bookingReference: booking.bookingReference, bookingStatus: booking.status, preferredDate: booking.preferredDate, preferredTimeFrom: booking.preferredTimeWindowStart, preferredTimeTo: booking.preferredTimeWindowEnd, preferredTimezone: booking.preferredTimezone, cancelledAssignmentCount, releasedReservationCount };
  }
}
