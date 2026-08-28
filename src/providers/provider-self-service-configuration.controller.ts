import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateProviderAvailabilityDto } from './dto/create-provider-availability.dto';
import { CreateProviderAvailabilityExceptionDto } from './dto/create-provider-availability-exception.dto';
import { CreateProviderLocationDto } from './dto/create-provider-location.dto';
import { CreateProviderServiceDto } from './dto/create-provider-service.dto';
import { ProviderServiceLocationParamsDto, ResourceIdParamsDto } from './dto/provider-params.dto';
import { UpdateProviderAvailabilityDto } from './dto/update-provider-availability.dto';
import { UpdateProviderAvailabilityExceptionDto } from './dto/update-provider-availability-exception.dto';
import { UpdateProviderLocationDto } from './dto/update-provider-location.dto';
import { ProviderSelfServiceConfigurationService } from './provider-self-service-configuration.service';
import { CreateProviderServiceAreaDto, UpdateProviderServiceAreaDto } from './dto/provider-service-area.dto';
import { UpdateProviderServicePriceDto } from './dto/update-provider-service-price.dto';

@ApiTags('Provider configuration') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER)
@ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiNotFoundResponse() @ApiConflictResponse() @Controller('provider')
export class ProviderSelfServiceConfigurationController {
  constructor(private readonly configuration: ProviderSelfServiceConfigurationService) {}
  @Get('services') listServices(@Req() req: { user: User }) { return this.configuration.listServices(req.user); }
  @Post('services') createService(@Req() req: { user: User }, @Body() dto: CreateProviderServiceDto) { return this.configuration.createService(req.user, dto); }
  @Patch('services/:id/activate') activateService(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.activateService(req.user, p.id); }
  @Patch('services/:id/deactivate') deactivateService(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.deactivateService(req.user, p.id); }
  @Patch('services/:id/price') updateServicePrice(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto, @Body() dto: UpdateProviderServicePriceDto) { return this.configuration.updateServicePrice(req.user, p.id, dto); }
  @Post('services/:serviceId/locations/:locationId') link(@Req() req: { user: User }, @Param() p: ProviderServiceLocationParamsDto) { return this.configuration.linkLocation(req.user, p.serviceId, p.locationId); }
  @Delete('services/:serviceId/locations/:locationId') unlink(@Req() req: { user: User }, @Param() p: ProviderServiceLocationParamsDto) { return this.configuration.unlinkLocation(req.user, p.serviceId, p.locationId); }

  @Get('locations') listLocations(@Req() req: { user: User }) { return this.configuration.listLocations(req.user); }
  @Post('locations') createLocation(@Req() req: { user: User }, @Body() dto: CreateProviderLocationDto) { return this.configuration.createLocation(req.user, dto); }
  @Get('locations/:id') getLocation(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.getLocation(req.user, p.id); }
  @Patch('locations/:id') updateLocation(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto, @Body() dto: UpdateProviderLocationDto) { return this.configuration.updateLocation(req.user, p.id, dto); }
  @Patch('locations/:id/activate') activateLocation(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.activateLocation(req.user, p.id); }
  @Patch('locations/:id/deactivate') deactivateLocation(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.deactivateLocation(req.user, p.id); }

  @Get('availability') listAvailability(@Req() req: { user: User }) { return this.configuration.listAvailability(req.user); }
  @Post('availability') createAvailability(@Req() req: { user: User }, @Body() dto: CreateProviderAvailabilityDto) { return this.configuration.createAvailability(req.user, dto); }
  @Get('availability/:id') getAvailability(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.getAvailability(req.user, p.id); }
  @Patch('availability/:id') updateAvailability(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto, @Body() dto: UpdateProviderAvailabilityDto) { return this.configuration.updateAvailability(req.user, p.id, dto); }
  @Patch('availability/:id/activate') activateAvailability(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.activateAvailability(req.user, p.id); }
  @Patch('availability/:id/deactivate') deactivateAvailability(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.deactivateAvailability(req.user, p.id); }

  @Get('availability-exceptions') listExceptions(@Req() req: { user: User }) { return this.configuration.listExceptions(req.user); }
  @Post('availability-exceptions') createException(@Req() req: { user: User }, @Body() dto: CreateProviderAvailabilityExceptionDto) { return this.configuration.createException(req.user, dto); }
  @Get('availability-exceptions/:id') getException(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.getException(req.user, p.id); }
  @Patch('availability-exceptions/:id') updateException(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto, @Body() dto: UpdateProviderAvailabilityExceptionDto) { return this.configuration.updateException(req.user, p.id, dto); }
  @Patch('availability-exceptions/:id/activate') activateException(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.activateException(req.user, p.id); }
  @Patch('availability-exceptions/:id/deactivate') deactivateException(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.deactivateException(req.user, p.id); }
  @Get('service-areas') listServiceAreas(@Req() req: { user: User }) { return this.configuration.listServiceAreas(req.user); }
  @Post('service-areas') createServiceArea(@Req() req: { user: User }, @Body() dto: CreateProviderServiceAreaDto) { return this.configuration.createServiceArea(req.user, dto); }
  @Get('service-areas/:id') getServiceArea(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.getServiceArea(req.user, p.id); }
  @Patch('service-areas/:id') updateServiceArea(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto, @Body() dto: UpdateProviderServiceAreaDto) { return this.configuration.updateServiceArea(req.user, p.id, dto); }
  @Patch('service-areas/:id/activate') activateServiceArea(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.activateServiceArea(req.user, p.id); }
  @Patch('service-areas/:id/deactivate') deactivateServiceArea(@Req() req: { user: User }, @Param() p: ResourceIdParamsDto) { return this.configuration.deactivateServiceArea(req.user, p.id); }
}
