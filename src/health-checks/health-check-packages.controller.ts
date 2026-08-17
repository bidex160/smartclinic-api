import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthCheckPackageResponseDto } from './dto/health-check-package-response.dto';
import { HealthCheckPackagesService } from './health-check-packages.service';

@ApiTags('Health check packages')
@Controller('health-check-packages')
export class HealthCheckPackagesController {
  constructor(private readonly healthCheckPackagesService: HealthCheckPackagesService) {}

  @Get()
  @ApiOperation({ summary: 'List active Health Check packages' })
  @ApiOkResponse({ type: HealthCheckPackageResponseDto, isArray: true })
  findActive(): Promise<HealthCheckPackageResponseDto[]> {
    return this.healthCheckPackagesService.findActive();
  }
}
