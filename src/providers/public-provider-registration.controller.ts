import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProviderOnboardingProfileResponseDto, RegisterProviderDto } from './dto/provider-onboarding.dto';
import { ProviderOnboardingService } from './provider-onboarding.service';

@ApiTags('Public provider onboarding')
@Controller('public/providers')
export class PublicProviderRegistrationController {
  constructor(private readonly onboarding: ProviderOnboardingService) {}
  @Post('register') @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a pending provider account and submit it for review' })
  @ApiCreatedResponse({ type: ProviderOnboardingProfileResponseDto }) @ApiConflictResponse()
  register(@Body() dto: RegisterProviderDto) { return this.onboarding.register(dto); }
}
