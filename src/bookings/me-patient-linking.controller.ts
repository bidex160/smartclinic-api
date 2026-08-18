import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { BookingReferenceParamsDto } from './dto/booking-reference-params.dto';
import { LinkPatientFromResultDto } from './dto/link-patient-from-result.dto';
import { PatientAccountLinkResponseDto } from './dto/patient-account-link-response.dto';
import { PatientAccountLinkingService } from './patient-account-linking.service';
import { PUBLIC_BOOKING_SESSION_COOKIE } from './public-booking-session.service';

@ApiTags('My patient account') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @ApiUnauthorizedResponse()
@ApiForbiddenResponse({ description: 'The guest ownership proof is invalid, expired, or revoked.' })
@ApiConflictResponse({ description: 'The account or Patient is already linked elsewhere.' })
@Controller()
export class MePatientLinkingController {
  constructor(private readonly linking: PatientAccountLinkingService) {}

  @Post('public/bookings/:reference/link-patient-account') @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(PUBLIC_BOOKING_SESSION_COOKIE) @ApiOperation({ summary: 'Link the booking participant using JWT plus the booking-bound guest session cookie' }) @ApiOkResponse({ type: PatientAccountLinkResponseDto })
  linkFromBooking(@Req() request: Request & { user: User }, @Param() params: BookingReferenceParamsDto): Promise<PatientAccountLinkResponseDto> { return this.linking.linkFromBooking(request.user, params.reference, this.readBookingCookie(request)); }

  @Post('me/patient/link-from-result') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link the encounter Patient using an active guest result-access token' }) @ApiOkResponse({ type: PatientAccountLinkResponseDto }) @ApiBadRequestResponse()
  linkFromResult(@Req() request: Request & { user: User }, @Body() dto: LinkPatientFromResultDto): Promise<PatientAccountLinkResponseDto> { return this.linking.linkFromResult(request.user, dto.resultAccessToken); }

  private readBookingCookie(request: Request): string | null { const prefix = `${PUBLIC_BOOKING_SESSION_COOKIE}=`; const entry = request.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix)); if (!entry) return null; try { return decodeURIComponent(entry.slice(prefix.length)); } catch { return null; } }
}
