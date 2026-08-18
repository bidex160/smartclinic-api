import { Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ResourceIdParamsDto } from '../providers/dto/provider-params.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { HealthResultAccessGrantResponseDto, IssuedHealthResultAccessGrantResponseDto } from './dto/health-result-access-grant.dto';
import { HealthResultAccessService } from './health-result-access.service';

@ApiTags('Admin health result access') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiBadRequestResponse() @ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiNotFoundResponse() @ApiConflictResponse()
@Controller('admin')
export class AdminHealthResultAccessController {
  constructor(private readonly results: HealthResultAccessService) {}
  @Post('health-check-encounters/:id/result-access') @ApiOperation({ summary: 'Issue one guest result-access token after operational identity verification' }) @ApiCreatedResponse({ type: IssuedHealthResultAccessGrantResponseDto })
  issue(@Req() request: { user: User }, @Param() { id }: ResourceIdParamsDto) { return this.results.issueGuestResultAccess(id, request.user.id); }
  @Post('health-result-access/:id/revoke') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Revoke an active guest result-access grant' }) @ApiOkResponse({ type: HealthResultAccessGrantResponseDto })
  revoke(@Param() { id }: ResourceIdParamsDto) { return this.results.revokeGuestResultAccess(id); }
}
