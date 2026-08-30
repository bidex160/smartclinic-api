import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminProviderPayoutListQueryDto, CompleteProviderPayoutDto, CreateProviderPayoutDto, EligibleProviderEarningQueryDto, ProviderPayoutListQueryDto, ProviderPayoutParamsDto, ProviderPayoutReasonDto } from './dto/provider-payout.dto';
import { ProviderPayoutsService } from './provider-payouts.service';

@ApiTags('Provider payouts') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider/payouts')
export class ProviderPayoutsController {
  constructor(private readonly payouts: ProviderPayoutsService) {}
  @Get() @ApiOperation({ summary: 'List own Provider payouts' }) list(@Req() request: { user: User }, @Query() query: ProviderPayoutListQueryDto) { return this.payouts.listMine(request.user, query); }
  @Get(':reference') @ApiOperation({ summary: 'Get own Provider payout detail' }) detail(@Req() request: { user: User }, @Param() params: ProviderPayoutParamsDto) { return this.payouts.detailMine(request.user, params.reference); }
}

@ApiTags('Admin Provider payouts') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS) @Controller('admin/provider-payouts')
export class AdminProviderPayoutsController {
  constructor(private readonly payouts: ProviderPayoutsService) {}
  @Get('eligible-earnings') @ApiOperation({ summary: 'List unreserved PAYABLE earnings eligible for payout' }) eligible(@Query() query: EligibleProviderEarningQueryDto) { return this.payouts.eligible(query); }
  @Get() @ApiOperation({ summary: 'List Provider payouts' }) list(@Query() query: AdminProviderPayoutListQueryDto) { return this.payouts.adminList(query); }
  @Get(':reference') @ApiOperation({ summary: 'Get Provider payout, earnings, and history' }) detail(@Param() params: ProviderPayoutParamsDto) { return this.payouts.adminDetail(params.reference); }
  @Post() @ApiOperation({ summary: 'Create a manual Provider payout and reserve PAYABLE earnings' }) create(@Req() request: { user: User }, @Body() body: CreateProviderPayoutDto) { return this.payouts.create(request.user.id, body); }
  @Post(':reference/process') process(@Req() request: { user: User }, @Param() params: ProviderPayoutParamsDto) { return this.payouts.process(params.reference, request.user.id); }
  @Post(':reference/complete') complete(@Req() request: { user: User }, @Param() params: ProviderPayoutParamsDto, @Body() body: CompleteProviderPayoutDto) { return this.payouts.complete(params.reference, request.user.id, body); }
  @Post(':reference/fail') fail(@Req() request: { user: User }, @Param() params: ProviderPayoutParamsDto, @Body() body: ProviderPayoutReasonDto) { return this.payouts.fail(params.reference, request.user.id, body.reason); }
  @Post(':reference/cancel') cancel(@Req() request: { user: User }, @Param() params: ProviderPayoutParamsDto, @Body() body: ProviderPayoutReasonDto) { return this.payouts.cancel(params.reference, request.user.id, body.reason); }
}
