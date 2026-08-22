import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ProviderOnboardingProfileResponseDto, UpdateProviderProfileDto } from './dto/provider-onboarding.dto';
import { ProviderOnboardingService } from './provider-onboarding.service';

@ApiTags('Provider onboarding') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER)
@ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiConflictResponse() @Controller('provider')
export class ProviderOnboardingController {
  constructor(private readonly onboarding: ProviderOnboardingService) {}
  @Get('profile') @ApiOperation({ summary: 'Get the authenticated provider onboarding profile' }) @ApiOkResponse({ type: ProviderOnboardingProfileResponseDto })
  get(@Req() request: { user: User }) { return this.onboarding.get(request.user); }
  @Patch('profile') @ApiOperation({ summary: 'Update permitted onboarding profile fields' }) @ApiOkResponse({ type: ProviderOnboardingProfileResponseDto })
  update(@Req() request: { user: User }, @Body() dto: UpdateProviderProfileDto) { return this.onboarding.update(request.user, dto); }
  @Post('onboarding/submit') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Submit or resubmit the provider profile for operations review' }) @ApiOkResponse({ type: ProviderOnboardingProfileResponseDto })
  submit(@Req() request: { user: User }) { return this.onboarding.submit(request.user); }
}
