import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminProviderCareServiceParamsDto, CreateCareServiceDefinitionDto, CreateProviderCareServiceDto, FindCareQueryDto, PublicCareServiceCatalogueItemDto, PublicFindCareProviderDto, PublicFindCareProviderListDto, PublicProviderReferenceParamsDto, SaveProviderClinicalTemplateDto, UpdateCareServiceDefinitionDto, UpdateProviderCareServiceDto } from './dto/care-service.dto';
import { ProviderIdParamsDto, ResourceIdParamsDto } from './dto/provider-params.dto';
import { FindCareService } from './find-care.service';
import { ProviderCareServicesService } from './provider-care-services.service';

@ApiTags('Find Care')
@Controller('public/find-care')
export class PublicFindCareController {
  constructor(private readonly findCare: FindCareService) {}
  @Get('services') @ApiOperation({ summary: 'List care services offered by approved providers' }) @ApiOkResponse({ type: PublicCareServiceCatalogueItemDto, isArray: true }) services() { return this.findCare.catalogue(); }
  @Get('providers') @ApiOperation({ summary: 'Discover approved providers by service, type, or authoritative location' }) @ApiOkResponse({ type: PublicFindCareProviderListDto }) providers(@Query() query: FindCareQueryDto) { return this.findCare.providersList(query); }
  @Get('providers/:reference') @ApiOperation({ summary: 'Get safe public provider and service details' }) @ApiOkResponse({ type: PublicFindCareProviderDto }) provider(@Param() params: PublicProviderReferenceParamsDto) { return this.findCare.providerDetail(params.reference); }
}

@ApiTags('Provider Find Care services') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER)
@Controller('provider/care-services')
export class ProviderCareServicesController {
  constructor(private readonly services: ProviderCareServicesService) {}
  @Get('catalogue') catalogue() { return this.services.listDefinitions(); }
  @Get() list(@Req() req: { user: User }) { return this.services.listMine(req.user); }
  @Post() create(@Req() req: { user: User }, @Body() dto: CreateProviderCareServiceDto) { return this.services.createMine(req.user, dto); }
  @Patch(':id') update(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto, @Body() dto: UpdateProviderCareServiceDto) { return this.services.updateMine(req.user, p.id, dto); }
  @Patch(':id/activate') activate(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.services.activateMine(req.user, p.id); }
  @Patch(':id/deactivate') deactivate(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.services.deactivateMine(req.user, p.id); }
  @Get(':id/clinical-documentation') documentation(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.services.getClinicalDocumentationMine(req.user, p.id); }
  @Patch(':id/clinical-documentation') saveDocumentation(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto, @Body() dto: SaveProviderClinicalTemplateDto) { return this.services.saveClinicalDocumentationMine(req.user, p.id, dto); }
  @Post(':id/clinical-documentation/reset') resetDocumentation(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.services.resetClinicalDocumentationMine(req.user, p.id); }
}

@ApiTags('Admin Find Care services') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin')
export class AdminCareServicesController {
  constructor(private readonly services: ProviderCareServicesService) {}
  @Get('care-service-definitions') definitions() { return this.services.listDefinitions(true); }
  @Post('care-service-definitions') createDefinition(@Body() dto: CreateCareServiceDefinitionDto) { return this.services.createDefinition(dto); }
  @Patch('care-service-definitions/:id') updateDefinition(@Param() p: ResourceIdParamsDto, @Body() dto: UpdateCareServiceDefinitionDto) { return this.services.updateDefinition(p.id, dto); }
  @Get('providers/:providerId/care-services') list(@Param() p: ProviderIdParamsDto) { return this.services.listForProvider(p.providerId); }
  @Post('providers/:providerId/care-services') create(@Param() p: ProviderIdParamsDto, @Body() dto: CreateProviderCareServiceDto) { return this.services.createForProvider(p.providerId, dto); }
  @Patch('providers/:providerId/care-services/:id') update(@Param() p: AdminProviderCareServiceParamsDto, @Body() dto: UpdateProviderCareServiceDto) { return this.services.updateForProvider(p.providerId, p.id, dto); }
  @Patch('providers/:providerId/care-services/:id/activate') activate(@Param() p: AdminProviderCareServiceParamsDto) { return this.services.setActive(p.providerId, p.id, true); }
  @Patch('providers/:providerId/care-services/:id/deactivate') deactivate(@Param() p: AdminProviderCareServiceParamsDto) { return this.services.setActive(p.providerId, p.id, false); }
}
