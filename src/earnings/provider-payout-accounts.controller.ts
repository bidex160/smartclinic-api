import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; import { Roles } from '../auth/roles.decorator'; import { RolesGuard } from '../auth/roles.guard'; import { User } from '../users/entities/user.entity'; import { UserRole } from '../users/enums/user-role.enum';
import { AdminProviderPayoutAccountListQueryDto, CreateProviderPayoutAccountDto, ProviderPayoutAccountListQueryDto, ProviderPayoutAccountParamsDto, ProviderPayoutAccountReasonDto, UpdateProviderPayoutAccountDto } from './dto/provider-payout-account.dto';
import { ProviderPayoutAccountsService } from './provider-payout-accounts.service';
@ApiTags('Provider payout accounts') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider/payout-accounts')
export class ProviderPayoutAccountsController {
  constructor(private readonly accounts: ProviderPayoutAccountsService) {}
  @Get() list(@Req() request: { user: User }, @Query() query: ProviderPayoutAccountListQueryDto) { return this.accounts.listMine(request.user, query); }
  @Get(':reference') detail(@Req() request: { user: User }, @Param() params: ProviderPayoutAccountParamsDto) { return this.accounts.detailMine(request.user, params.reference); }
  @Post() @ApiOperation({ summary: 'Submit a bank account for manual SmartClinic verification' }) create(@Req() request: { user: User }, @Body() body: CreateProviderPayoutAccountDto) { return this.accounts.create(request.user, body); }
  @Patch(':reference') @ApiOperation({ summary: 'Correct a pending payout account' }) update(@Req() request: { user: User }, @Param() params: ProviderPayoutAccountParamsDto, @Body() body: UpdateProviderPayoutAccountDto) { return this.accounts.update(request.user, params.reference, body); }
  @Post(':reference/default') setDefault(@Req() request: { user: User }, @Param() params: ProviderPayoutAccountParamsDto) { return this.accounts.setDefault(request.user, params.reference); }
  @Post(':reference/disable') disable(@Req() request: { user: User }, @Param() params: ProviderPayoutAccountParamsDto, @Body() body: ProviderPayoutAccountReasonDto) { return this.accounts.disableMine(request.user, params.reference, body.reason); }
}
@ApiTags('Admin Provider payout accounts') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS) @Controller('admin/provider-payout-accounts')
export class AdminProviderPayoutAccountsController {
  constructor(private readonly accounts: ProviderPayoutAccountsService) {}
  @Get() list(@Query() query: AdminProviderPayoutAccountListQueryDto) { return this.accounts.adminList(query); }
  @Get(':reference') detail(@Param() params: ProviderPayoutAccountParamsDto) { return this.accounts.adminDetail(params.reference); }
  @Post(':reference/verify') verify(@Req() request: { user: User }, @Param() params: ProviderPayoutAccountParamsDto, @Body() body: ProviderPayoutAccountReasonDto) { return this.accounts.verify(params.reference, request.user.id, body.reason); }
  @Post(':reference/disable') disable(@Req() request: { user: User }, @Param() params: ProviderPayoutAccountParamsDto, @Body() body: ProviderPayoutAccountReasonDto) { return this.accounts.disableAdmin(params.reference, request.user.id, body.reason); }
}
