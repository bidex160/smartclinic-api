import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import {
  AdminReferralQueryDto,
  PublicReferralLeaderboardDto,
  ReferralHistoryQueryDto,
  ReferralImpactDto,
  ReferralSummaryDto,
  UpdateReferralPreferencesDto,
} from "./dto/referral.dto";
import { ReferralImpactService } from "./referral-impact.service";
import { ReferralsService } from "./referrals.service";

@ApiTags("My referrals and rewards")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/referrals")
export class MeReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly impactService: ReferralImpactService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      "Get direct-referral links, points balance, and cumulative level progress",
  })
  @ApiOkResponse({ type: ReferralSummaryDto })
  summary(@Req() request: { user: User }) {
    return this.referrals.summary(request.user.id);
  }
  @Get("history")
  @ApiOperation({ summary: "List safe direct-referral history" })
  history(
    @Req() request: { user: User },
    @Query() query: ReferralHistoryQueryDto,
  ) {
    return this.referrals.history(request.user.id, query);
  }
  @Patch("preferences")
  @ApiOperation({ summary: "Opt in or out of public referral rankings" })
  preferences(
    @Req() request: { user: User },
    @Body() body: UpdateReferralPreferencesDto,
  ) {
    return this.impactService.updatePreference(
      request.user.id,
      body.publicLeaderboard,
    );
  }
}

@ApiTags("My impact")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/impact")
export class MeImpactController {
  constructor(private readonly impactService: ReferralImpactService) {}
  @Get()
  @ApiOperation({
    summary: "Get authenticated referral, reward, and progression impact",
  })
  @ApiOkResponse({ type: ReferralImpactDto })
  impact(@Req() request: { user: User }) {
    return this.impactService.impact(request.user.id);
  }
}

@ApiTags("Public referrals")
@Controller("public/referrals")
export class PublicReferralsController {
  constructor(private readonly impactService: ReferralImpactService) {}
  @Get("leaderboard")
  @Header("Cache-Control", "public, max-age=60")
  @ApiOperation({ summary: "Get the opt-in public referral leaderboard" })
  @ApiOkResponse({ type: PublicReferralLeaderboardDto })
  leaderboard() {
    return this.impactService.leaderboard();
  }
}

@ApiTags("Admin referrals")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller("admin/referrals")
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get()
  @ApiOperation({ summary: "List direct referrals for operational review" })
  list(@Query() query: AdminReferralQueryDto) {
    return this.referrals.adminHistory(query);
  }
}
