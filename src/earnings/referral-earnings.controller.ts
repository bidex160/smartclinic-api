import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { ReferralEarningStatus } from "./enums/referral-earning-status.enum";
import { ReferralEarningsService } from "./referral-earnings.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.PROVIDER)
@Controller("me/referral-earnings")
export class ReferralEarningsController {
  constructor(private readonly earnings: ReferralEarningsService) {}
  @Get("summary") summary(@Req() request: { user: User }) {
    return this.earnings.balancesOwn(request.user.id);
  }
  @Get() list(@Req() request: { user: User }) {
    return this.earnings.listOwn(request.user.id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller("admin/referral-earnings")
export class AdminReferralEarningsController {
  constructor(private readonly earnings: ReferralEarningsService) {}
  @Get() list(
    @Query("referrerUserId") referrerUserId?: string,
    @Query("status") status?: ReferralEarningStatus,
    @Query("currency") currency?: string,
    @Query("sourceType") sourceType?: string,
  ) {
    return this.earnings.listAdmin({
      referrerUserId,
      status,
      currency,
      sourceType,
    });
  }
}
