import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CareRequestReferenceParamsDto } from '../care-requests/dto/care-request.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { PaymentFlowService } from './payment-flow.service';
@ApiTags('My Care Request funding') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @Controller('me/care-requests/:reference/funding')
export class MeCareRequestFundingController {
  constructor(private readonly payments: PaymentFlowService) {}
  @Get() @ApiOperation({ summary: 'Read authoritative General Care funding status' }) @ApiOkResponse() get(@Req() request: { user: User }, @Param() { reference }: CareRequestReferenceParamsDto) { return this.payments.getCareRequestFunding(reference, request.user.id); }
  @Post('initialize') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Initialize or reuse General Care Paystack payment' }) initialize(@Req() request: { user: User }, @Param() { reference }: CareRequestReferenceParamsDto) { return this.payments.initializeCareRequestFunding(reference, request.user.id); }
  @Post('verify-latest') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Verify the latest stored General Care payment attempt' }) verify(@Req() request: { user: User }, @Param() { reference }: CareRequestReferenceParamsDto) { return this.payments.verifyLatestCareRequestFunding(reference, request.user.id); }
}
