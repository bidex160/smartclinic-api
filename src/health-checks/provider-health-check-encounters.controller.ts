import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BookingReferenceParamsDto } from '../bookings/dto/booking-reference-params.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ProviderHealthCheckEncounterResponseDto } from './dto/provider-health-check-encounter-response.dto';
import { SaveHealthCheckMeasurementsDto } from './dto/save-health-check-measurements.dto';
import { ProviderHealthCheckEncountersService } from './provider-health-check-encounters.service';

@ApiTags('Provider health checks') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER)
@ApiUnauthorizedResponse() @ApiForbiddenResponse({ description: 'PROVIDER role and an active linked Provider are required.' }) @ApiNotFoundResponse({ description: 'No owned confirmed health-check encounter or booking was found.' }) @ApiConflictResponse() @ApiBadRequestResponse()
@Controller('provider/bookings/:reference/health-check')
export class ProviderHealthCheckEncountersController {
  constructor(private readonly encounters: ProviderHealthCheckEncountersService) {}
  @Post('start') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Start an owned confirmed health-check encounter' }) @ApiOkResponse({ type: ProviderHealthCheckEncounterResponseDto }) start(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { return this.encounters.start(request.user, reference); }
  @Get() @ApiOperation({ summary: 'Get the authenticated provider’s encounter for a booking' }) @ApiOkResponse({ type: ProviderHealthCheckEncounterResponseDto }) get(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { return this.encounters.get(request.user, reference); }
  @Put('measurements') @ApiOperation({ summary: 'Save all six structured measurements without completing the encounter' }) @ApiOkResponse({ type: ProviderHealthCheckEncounterResponseDto }) save(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto, @Body() dto: SaveHealthCheckMeasurementsDto) { return this.encounters.saveMeasurements(request.user, reference, dto); }
  @Post('complete') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Complete an encounter after all six measurements are recorded' }) @ApiOkResponse({ type: ProviderHealthCheckEncounterResponseDto }) complete(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { return this.encounters.complete(request.user, reference); }
}
