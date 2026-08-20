import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BookingReferenceParamsDto } from '../bookings/dto/booking-reference-params.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminBookingSchedulingService } from './admin-booking-scheduling.service';
import { AdminBookingScheduleResponseDto } from './dto/admin-booking-schedule-response.dto';
import { ScheduleBookingDto } from './dto/schedule-booking.dto';

@ApiTags('Admin booking scheduling') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse() @Controller('admin/bookings')
export class AdminBookingSchedulingController {
  constructor(private readonly scheduling: AdminBookingSchedulingService) {}
  @Post(':reference/schedule') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Confirm a provider-assigned booking appointment (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: AdminBookingScheduleResponseDto })
  schedule(@Param() { reference }: BookingReferenceParamsDto, @Req() request: { user: User }, @Body() dto: ScheduleBookingDto) { return this.scheduling.schedule(reference, request.user.id, dto); }
}
