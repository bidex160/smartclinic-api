import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminProviderInvitationSummaryDto, CreateProviderInvitationDto, CreatedProviderInvitationResponseDto } from './dto/provider-invitation.dto';
import { ProviderIdParamsDto, ResourceIdParamsDto } from './dto/provider-params.dto';
import { ProviderInvitationsService } from './provider-invitations.service';

@ApiTags('Admin provider invitations') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiBadRequestResponse() @ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiNotFoundResponse() @ApiConflictResponse()
@Controller('admin')
export class AdminProviderInvitationsController {
  constructor(private readonly invitations: ProviderInvitationsService) {}
  @Post('providers/:providerId/invitations') @ApiOperation({ summary: 'Create a one-time provider invitation for manual delivery' }) @ApiCreatedResponse({ type: CreatedProviderInvitationResponseDto }) create(@Param() { providerId }: ProviderIdParamsDto, @Body() dto: CreateProviderInvitationDto, @Req() request: { user: User }) { return this.invitations.create(providerId, dto.email, request.user.id); }
  @Get('providers/:providerId/invitations') @ApiOperation({ summary: 'List safe provider invitation summaries' }) @ApiOkResponse({ type: AdminProviderInvitationSummaryDto, isArray: true }) list(@Param() { providerId }: ProviderIdParamsDto) { return this.invitations.list(providerId); }
  @Post('provider-invitations/:id/revoke') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Revoke a pending provider invitation' }) @ApiOkResponse({ type: AdminProviderInvitationSummaryDto }) revoke(@Param() { id }: ResourceIdParamsDto) { return this.invitations.revoke(id); }
}
