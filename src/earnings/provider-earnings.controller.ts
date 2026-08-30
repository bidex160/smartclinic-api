import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminProviderEarningBalanceQueryDto, AdminProviderEarningListQueryDto, AdminProviderEarningResponseDto, ProviderEarningBalanceDto, ProviderEarningListQueryDto, ProviderEarningListResponseDto, ProviderEarningParamsDto, ProviderEarningResponseDto } from './dto/provider-earning.dto';
import { ProviderEarningsService } from './provider-earnings.service';

@ApiTags('Provider earnings') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider/earnings')
export class ProviderEarningsController {
  constructor(private readonly earnings: ProviderEarningsService) {}
  @Get('summary') @ApiOperation({ summary: 'Get own ledger-derived earnings summary by currency' }) @ApiOkResponse({ type: ProviderEarningBalanceDto, isArray: true }) summary(@Req() request: { user: User }) { return this.earnings.balancesOwn(request.user); }
  @Get() @ApiOperation({ summary: 'List own Provider earnings' }) @ApiOkResponse({ type: ProviderEarningListResponseDto }) list(@Req() request: { user: User }, @Query() query: ProviderEarningListQueryDto) { return this.earnings.listOwn(request.user, query); }
  @Get(':reference') @ApiOperation({ summary: 'Get one own Provider earning' }) @ApiOkResponse({ type: ProviderEarningResponseDto }) get(@Req() request: { user: User }, @Param() { reference }: ProviderEarningParamsDto) { return this.earnings.getOwn(request.user, reference); }
}

@ApiTags('Admin Provider earnings and revenue') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS) @Controller('admin/provider-earnings')
export class AdminProviderEarningsController {
  constructor(private readonly earnings: ProviderEarningsService) {}
  @Get('summary') @ApiOperation({ summary: 'Get ledger-derived platform revenue and Provider share summary by currency' }) @ApiOkResponse({ type: ProviderEarningBalanceDto, isArray: true }) summary(@Query() query: AdminProviderEarningBalanceQueryDto) { return this.earnings.balancesAdmin(query.providerId, query.providerReference); }
  @Get() @ApiOperation({ summary: 'List Provider earnings and platform commission history' }) @ApiOkResponse({ type: ProviderEarningListResponseDto }) list(@Query() query: AdminProviderEarningListQueryDto) { return this.earnings.listAdmin(query); }
  @Get(':reference') @ApiOperation({ summary: 'Inspect one Provider earning' }) @ApiOkResponse({ type: AdminProviderEarningResponseDto }) get(@Param() { reference }: ProviderEarningParamsDto) { return this.earnings.getAdmin(reference); }
}
