import { Body, Controller, Delete, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ResourceIdParamsDto } from '../providers/dto/provider-params.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminCommissionService } from './admin-commission.service';
import { PlatformCommissionResponseDto, ProviderCommissionResponseDto, SetCommissionRateDto } from './dto/commission-config.dto';

@ApiTags('Admin commission configuration') @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/commercial-settings')
export class AdminPlatformCommissionController {
  constructor(private readonly commissions: AdminCommissionService) {}
  @Get('provider-commission') @ApiOperation({ summary: 'Read the platform Provider commission default' }) @ApiOkResponse({ type: PlatformCommissionResponseDto }) getPlatform() { return this.commissions.getPlatform(); }
  @Patch('provider-commission') @ApiOperation({ summary: 'Configure the platform Provider commission default' }) @ApiOkResponse({ type: PlatformCommissionResponseDto }) setPlatform(@Body() dto: SetCommissionRateDto, @Req() request: { user: User }) { return this.commissions.setPlatform(dto.commissionBasisPoints, request.user.id); }
}

@ApiTags('Admin provider commission') @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/providers')
export class AdminProviderCommissionController {
  constructor(private readonly commissions: AdminCommissionService) {}
  @Get(':id/commission') @ApiOperation({ summary: 'Read a Provider commission override and effective rate' }) @ApiOkResponse({ type: ProviderCommissionResponseDto }) getProvider(@Param() { id }: ResourceIdParamsDto) { return this.commissions.getProvider(id); }
  @Patch(':id/commission') @ApiOperation({ summary: 'Set an explicit Provider commission override' }) @ApiOkResponse({ type: ProviderCommissionResponseDto }) setProvider(@Param() { id }: ResourceIdParamsDto, @Body() dto: SetCommissionRateDto, @Req() request: { user: User }) { return this.commissions.setProvider(id, dto.commissionBasisPoints, request.user.id); }
  @Delete(':id/commission') @ApiOperation({ summary: 'Clear a Provider override and restore platform inheritance' }) @ApiOkResponse({ type: ProviderCommissionResponseDto }) clearProvider(@Param() { id }: ResourceIdParamsDto, @Req() request: { user: User }) { return this.commissions.setProvider(id, null, request.user.id); }
}
