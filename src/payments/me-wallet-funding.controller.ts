import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { InitializeWalletTopUpDto } from './dto/initialize-wallet-top-up.dto';
import { PaymentFlowService } from './payment-flow.service';

@ApiTags('My Wallet Funding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/wallet/funding')
export class MeWalletFundingController {
  constructor(private readonly payments: PaymentFlowService) {}

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  initialize(@Req() request: { user: User }, @Body() dto: InitializeWalletTopUpDto) {
    return this.payments.initializeWalletTopUp(request.user.id, dto);
  }

  @Post('verify-latest')
  @HttpCode(HttpStatus.OK)
  verify(@Req() request: { user: User }, @Query('reference') reference: string) {
    return this.payments.verifyLatestWalletTopUp(request.user.id, reference);
  }

  @Get('status')
  status(@Req() request: { user: User }, @Query('reference') reference: string) {
    return this.payments.getWalletTopUp(request.user.id, reference);
  }
}
