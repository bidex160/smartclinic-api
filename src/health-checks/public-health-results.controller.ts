import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResultAccessTokenParamsDto } from './dto/health-result-access-grant.dto';
import { HealthResultResponseDto } from './dto/health-result-response.dto';
import { HealthResultAccessService } from './health-result-access.service';

@ApiTags('Public health results') @ApiNotFoundResponse({ description: 'The guest result-access token is invalid, expired, revoked, or unavailable.' })
@Controller('public/health-results')
export class PublicHealthResultsController {
  constructor(private readonly results: HealthResultAccessService) {}
  @Get(':token') @ApiOperation({ summary: 'Use an encounter-scoped guest token to retrieve completed measurements' }) @ApiOkResponse({ type: HealthResultResponseDto })
  get(@Param() { token }: HealthResultAccessTokenParamsDto) { return this.results.getGuestResult(token); }
}
