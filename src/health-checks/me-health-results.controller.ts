import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookingReferenceParamsDto } from '../bookings/dto/booking-reference-params.dto';
import { User } from '../users/entities/user.entity';
import { HealthResultResponseDto } from './dto/health-result-response.dto';
import { HealthResultAccessService } from './health-result-access.service';
import { PatientHealthCheckHistoryQueryDto } from './dto/patient-health-check-history-query.dto';
import { PatientHealthCheckHistoryResponseDto } from './dto/patient-health-check-history-response.dto';
import { PatientHealthCheckDetailResponseDto } from './dto/patient-health-check-history-response.dto';
import { PatientHealthCheckHistoryService } from './patient-health-check-history.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('My health results') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @ApiUnauthorizedResponse() @ApiNotFoundResponse({ description: 'No Health Check belongs to the authenticated linked Patient.' })
@Controller('me/health-checks')
export class MeHealthResultsController {
  constructor(private readonly results: HealthResultAccessService, private readonly history: PatientHealthCheckHistoryService) {}
  @Get() @ApiOperation({ summary: 'List the authenticated Patient’s Health Check history; an unlinked User receives an empty page' }) @ApiOkResponse({ type: PatientHealthCheckHistoryResponseDto })
  list(@Req() request: { user: User }, @Query() query: PatientHealthCheckHistoryQueryDto) { return this.history.list(request.user, query); }
  @Get(':reference') @ApiOperation({ summary: 'Get one patient-safe Health Check belonging to the authenticated SELF Patient' }) @ApiOkResponse({ type: PatientHealthCheckDetailResponseDto })
  detail(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { return this.history.get(request.user, reference); }
  @Get(':reference/results') @ApiOperation({ summary: 'Get the authenticated patient’s completed Health Check measurements' }) @ApiOkResponse({ type: HealthResultResponseDto })
  get(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { return this.results.getRegisteredResult(request.user, reference); }
}
