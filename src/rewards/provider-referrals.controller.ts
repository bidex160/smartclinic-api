import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

import {
  ReferralHistoryQueryDto,
  ReferralSummaryDto,
} from './dto/referral.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('Provider referrals and rewards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/referrals/invitatiion')
export class ProviderReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get provider referral links, points balance, and progress',
  })
  @ApiOkResponse({ type: ReferralSummaryDto })
  summary(@Req() request: { user: User }) {
    return this.referrals.summary(request.user.id);
  }

  @Get('history')
  @ApiOperation({
    summary: 'List provider direct-referral history',
  })
  history(
    @Req() request: { user: User },
    @Query() query: ReferralHistoryQueryDto,
  ) {
    return this.referrals.history(request.user.id, query);
  }
}