import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { AdminRewardWithdrawalQueryDto, CreateRewardWithdrawalDto, MarkWithdrawalPaidDto, RewardWithdrawalQueryDto, WithdrawalReasonDto } from "./dto/reward-withdrawal.dto";
import { RewardWithdrawalsService } from "./reward-withdrawals.service";

@ApiTags("My reward withdrawals")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/rewards/withdrawals")
export class MeRewardWithdrawalsController {
  constructor(private readonly service: RewardWithdrawalsService) {}
  @Get() @ApiOperation({ summary: "List my reward withdrawal requests" }) list(@Req() request: { user: User }, @Query() query: RewardWithdrawalQueryDto) { return this.service.listMine(request.user.id, query); }
  @Get(":reference") @ApiOperation({ summary: "Get my reward withdrawal request" }) get(@Req() request: { user: User }, @Param("reference") reference: string) { return this.service.getMine(request.user.id, reference); }
  @Post() @ApiOperation({ summary: "Request a manual cash withdrawal and reserve points" }) create(@Req() request: { user: User }, @Body() body: CreateRewardWithdrawalDto) { return this.service.create(request.user.id, body); }
  @Post(":reference/cancel") @ApiOperation({ summary: "Cancel my requested withdrawal" }) cancel(@Req() request: { user: User }, @Param("reference") reference: string) { return this.service.cancelMine(request.user.id, reference); }
}

@ApiTags("Admin reward withdrawals")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller("admin/reward-withdrawals")
export class AdminRewardWithdrawalsController {
  constructor(private readonly service: RewardWithdrawalsService) {}
  @Get() @ApiOperation({ summary: "List manual reward withdrawals" }) list(@Query() query: AdminRewardWithdrawalQueryDto) { return this.service.adminList(query); }
  @Get(":reference") @ApiOperation({ summary: "Get withdrawal details and status history" }) detail(@Param("reference") reference: string) { return this.service.adminDetail(reference); }
  @Post(":reference/processing") processing(@Req() request: { user: User }, @Param("reference") reference: string) { return this.service.processing(reference, request.user.id); }
  @Post(":reference/paid") paid(@Req() request: { user: User }, @Param("reference") reference: string, @Body() body: MarkWithdrawalPaidDto) { return this.service.paid(reference, request.user.id, body); }
  @Post(":reference/failed") failed(@Req() request: { user: User }, @Param("reference") reference: string, @Body() body: WithdrawalReasonDto) { return this.service.failed(reference, request.user.id, body.reason); }
  @Post(":reference/cancel") cancel(@Req() request: { user: User }, @Param("reference") reference: string, @Body() body: WithdrawalReasonDto) { return this.service.adminCancel(reference, request.user.id, body.reason); }
}
