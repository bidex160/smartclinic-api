import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminReferralQueryDto, ReferralHistoryQueryDto, ReferralSummaryDto } from './dto/referral.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('My referrals and rewards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/referrals')
export class MeReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get() @ApiOperation({ summary: 'Get direct-referral links, points balance, and Level 1 progress' }) @ApiOkResponse({ type: ReferralSummaryDto })
  summary(@Req() request: { user: User }) { return this.referrals.summary(request.user.id); }
  @Get('history') @ApiOperation({ summary: 'List safe direct-referral history' })
  history(@Req() request: { user: User }, @Query() query: ReferralHistoryQueryDto) { return this.referrals.history(request.user.id, query); }
}

@ApiTags('Admin referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/referrals')
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get() @ApiOperation({ summary: 'List direct referrals for operational review' })
  list(@Query() query: AdminReferralQueryDto) { return this.referrals.adminHistory(query); }
}
