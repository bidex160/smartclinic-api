import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthCheckPackageResponseDto } from './dto/health-check-package-response.dto';
import { HealthCheckPackagesService } from './health-check-packages.service';
import { HealthCheckConfigurationQuoteDto } from './dto/health-check-configuration-quote.dto';
import { HealthCheckConfigurationService } from './health-check-configuration.service';

@ApiTags('Health check packages')
@Controller('health-check-packages')
export class HealthCheckPackagesController {
  constructor(private readonly healthCheckPackagesService: HealthCheckPackagesService, private readonly configuration: HealthCheckConfigurationService) {}

  @Get()
  @ApiOperation({ summary: 'List active Health Check packages' })
  @ApiOkResponse({ type: HealthCheckPackageResponseDto, isArray: true })
  findActive(): Promise<HealthCheckPackageResponseDto[]> {
    return this.healthCheckPackagesService.findActive();
  }

  @Get('catalogue')
  async catalogue() {
    return (await this.healthCheckPackagesService.findActive()).map(({ id: _legacyId, ...item }) => item);
  }

  @Post('configuration-quote')
  quote(@Body() dto: HealthCheckConfigurationQuoteDto) { return this.configuration.quote(dto); }
}
