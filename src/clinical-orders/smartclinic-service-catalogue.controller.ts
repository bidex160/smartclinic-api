import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateServiceCatalogueItemDto, ServiceCatalogueQueryDto, UpdateServiceCatalogueItemDto } from './dto/service-catalogue.dto';
import { SmartClinicServiceCatalogueService } from './smartclinic-service-catalogue.service';

@ApiTags('SmartClinic Service Catalogue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SmartClinicServiceCatalogueController {
  constructor(private readonly service: SmartClinicServiceCatalogueService) {}

  @Get('me/service-catalogue')
  @Roles(UserRole.USER)
  mine(@Query() q: ServiceCatalogueQueryDto) { return this.service.list(q, true); }

  @Get('provider/service-catalogue')
  @Roles(UserRole.PROVIDER)
  provider(@Query() q: ServiceCatalogueQueryDto) { return this.service.list(q, true); }

  @Get('admin/service-catalogue')
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  admin(@Query() q: ServiceCatalogueQueryDto) { return this.service.list(q, false); }

  @Post('admin/service-catalogue')
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  create(@Body() dto: CreateServiceCatalogueItemDto) { return this.service.create(dto); }

  @Put('admin/service-catalogue/:code')
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  update(@Param('code') code: string, @Body() dto: UpdateServiceCatalogueItemDto) { return this.service.update(code, dto); }
}
