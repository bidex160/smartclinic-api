import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateProviderServiceUnitDto, ProviderServiceUnitParamsDto, ServiceUnitListQueryDto, UpdateProviderServiceUnitDto } from './dto/provider-service-unit.dto';
import { ProviderServiceUnitsService } from './provider-service-units.service';

@ApiTags('Provider Service Units') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER) @Controller('provider/service-units')
export class ProviderServiceUnitsController {
  constructor(private readonly service: ProviderServiceUnitsService) {}
  @Get() list(@Req() r: { user: User }, @Query() q: ServiceUnitListQueryDto) { return this.service.list(r.user, q); }
  @Post() create(@Req() r: { user: User }, @Body() d: CreateProviderServiceUnitDto) { return this.service.create(r.user, d); }
  @Get(':reference') get(@Req() r: { user: User }, @Param() p: ProviderServiceUnitParamsDto) { return this.service.get(r.user, p.reference); }
  @Patch(':reference') update(@Req() r: { user: User }, @Param() p: ProviderServiceUnitParamsDto, @Body() d: UpdateProviderServiceUnitDto) { return this.service.update(r.user, p.reference, d); }
  @Post(':reference/activate') activate(@Req() r: { user: User }, @Param() p: ProviderServiceUnitParamsDto) { return this.service.activate(r.user, p.reference); }
  @Post(':reference/deactivate') deactivate(@Req() r: { user: User }, @Param() p: ProviderServiceUnitParamsDto) { return this.service.deactivate(r.user, p.reference); }
}

@ApiTags('Admin Provider Service Units') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS) @Controller('admin/providers')
export class AdminProviderServiceUnitsController {
  constructor(private readonly service: ProviderServiceUnitsService) {}
  @Get(':providerReference/service-units') list(@Param('providerReference') providerReference:string,@Query() q:ServiceUnitListQueryDto){return this.service.listForAdmin(providerReference,q);}
}
