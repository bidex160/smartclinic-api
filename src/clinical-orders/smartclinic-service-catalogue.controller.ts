import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { Req } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { SmartClinicCatalogueCategory } from './entities/smartclinic-service-catalogue-item.entity';
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
  provider(@Req() req:{user:User}, @Query('category') category?:SmartClinicCatalogueCategory) { return this.service.providerOfferings(req.user,category); }

  @Put('provider/service-catalogue/:code')
  @Roles(UserRole.PROVIDER)
  setProvider(@Req() req:{user:User},@Param('code') code:string,@Body() body:{selected:boolean;providerServiceUnitReference?:string;priceOverrideMinor?:number|null}) { return this.service.setProviderOffering(req.user,code,body); }

  @Get('me/service-catalogue/:code/providers')
  @Roles(UserRole.USER)
  providers(@Param('code') code:string){return this.service.patientProviders(code);}

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
