import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthCheckPackageResponseDto } from './dto/health-check-package-response.dto';
import { HealthCheckPackagesService } from './health-check-packages.service';
import { HealthCheckConfigurationQuoteDto } from './dto/health-check-configuration-quote.dto';
import { HealthCheckConfigurationService } from './health-check-configuration.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';import { RolesGuard } from '../auth/roles.guard';import { Roles } from '../auth/roles.decorator';import { UserRole } from '../users/enums/user-role.enum';import { User } from '../users/entities/user.entity';
import { Query } from '@nestjs/common';import { HealthCheckOfferingDiscoveryDto } from './dto/health-check-offering-discovery.dto';

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
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles(UserRole.USER)
  quote(@Req()req:{user:User},@Body() dto: HealthCheckConfigurationQuoteDto) { return this.configuration.quote(req.user,dto); }
  @Get('providers')@UseGuards(JwtAuthGuard,RolesGuard)@Roles(UserRole.USER)
  providers(@Query()dto:HealthCheckOfferingDiscoveryDto){return this.configuration.discover(dto);}
}
