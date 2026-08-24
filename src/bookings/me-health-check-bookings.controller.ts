import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateSelfBookingDto } from './dto/create-self-booking.dto';
import { BookingsService } from './bookings.service';

@ApiTags('My Health Checks') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @Controller('me/health-checks')
export class MeHealthCheckBookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Post() @ApiOperation({ summary: 'Create a Health Check for the authenticated USER’s SELF Patient' }) @ApiCreatedResponse({ type: BookingResponseDto })
  create(@Req() request: { user: User }, @Body() dto: CreateSelfBookingDto) { return this.bookings.createSelf(request.user, dto); }
}
