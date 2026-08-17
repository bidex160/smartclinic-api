import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateProviderAvailabilityDto } from './dto/create-provider-availability.dto';
import { ProviderAvailabilityResponseDto } from './dto/provider-availability-response.dto';
import { ProviderIdParamsDto, ResourceIdParamsDto } from './dto/provider-params.dto';
import { UpdateProviderAvailabilityDto } from './dto/update-provider-availability.dto';
import { ProviderAvailabilityService } from './provider-availability.service';

@ApiTags('Admin provider availability') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
@Controller('admin')
export class AdminProviderAvailabilityController {
  constructor(private readonly availability: ProviderAvailabilityService) {}
  @Get('providers/:providerId/availability') @ApiOperation({ summary: 'List weekly provider availability (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: ProviderAvailabilityResponseDto, isArray: true })
  list(@Param() { providerId }: ProviderIdParamsDto) { return this.availability.list(providerId); }
  @Post('providers/:providerId/availability') @ApiOperation({ summary: 'Create weekly provider availability (ADMIN or OPERATIONS)' }) @ApiCreatedResponse({ type: ProviderAvailabilityResponseDto })
  create(@Param() { providerId }: ProviderIdParamsDto, @Body() dto: CreateProviderAvailabilityDto) { return this.availability.create(providerId, dto); }
  @Get('provider-availability/:id') @ApiOperation({ summary: 'Get provider availability (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: ProviderAvailabilityResponseDto })
  get(@Param() { id }: ResourceIdParamsDto) { return this.availability.get(id); }
  @Patch('provider-availability/:id') @ApiOperation({ summary: 'Update provider availability (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: ProviderAvailabilityResponseDto })
  update(@Param() { id }: ResourceIdParamsDto, @Body() dto: UpdateProviderAvailabilityDto) { return this.availability.update(id, dto); }
  @Patch('provider-availability/:id/activate') @ApiOperation({ summary: 'Activate provider availability (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: ProviderAvailabilityResponseDto })
  activate(@Param() { id }: ResourceIdParamsDto) { return this.availability.activate(id); }
  @Patch('provider-availability/:id/deactivate') @ApiOperation({ summary: 'Deactivate provider availability (ADMIN or OPERATIONS)' }) @ApiOkResponse({ type: ProviderAvailabilityResponseDto })
  deactivate(@Param() { id }: ResourceIdParamsDto) { return this.availability.deactivate(id); }
}
