import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';

class ScheduledProviderDto { @ApiProperty() displayName!: string; }
class ScheduledProviderLocationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() countryCode!: string;
}
export class AdminBookingScheduleResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiProperty({ format: 'date' }) scheduledDate!: string;
  @ApiProperty() scheduledTimeFrom!: string;
  @ApiProperty() scheduledTimeTo!: string;
  @ApiProperty() scheduledTimezone!: string;
  @ApiProperty({ type: ScheduledProviderDto }) provider!: ScheduledProviderDto;
  @ApiPropertyOptional({ type: ScheduledProviderLocationDto, nullable: true }) providerLocation!: ScheduledProviderLocationDto | null;
  @ApiProperty({ enum: ProviderAssignmentStatus }) assignmentStatus!: ProviderAssignmentStatus;
}
