import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookingReferenceParamsDto } from '../bookings/dto/booking-reference-params.dto';
import { User } from '../users/entities/user.entity';
import { HealthResultResponseDto } from './dto/health-result-response.dto';
import { HealthResultAccessService } from './health-result-access.service';

@ApiTags('My health results') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @ApiUnauthorizedResponse() @ApiNotFoundResponse({ description: 'No completed result belongs to the authenticated linked Patient.' })
@Controller('me/health-checks')
export class MeHealthResultsController {
  constructor(private readonly results: HealthResultAccessService) {}
  @Get(':reference/results') @ApiOperation({ summary: 'Get the authenticated patient’s completed Health Check measurements' }) @ApiOkResponse({ type: HealthResultResponseDto })
  get(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { return this.results.getRegisteredResult(request.user, reference); }
}
