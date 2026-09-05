import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CheckoutFundingOption } from './enums/checkout-funding-option.enum';
import { PaymentFlowService } from '../payments/payment-flow.service';
import { PublicCheckoutSelectionDto } from '../payments/dto/initiate-payment.dto';
import { PublicPaymentInitiationResponseDto } from '../payments/dto/public-payment-initiation-response.dto';
import { PublicPaymentStatusResponseDto } from '../payments/dto/public-payment-status-response.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { BookingsService } from './bookings.service';
import { BookingReferenceParamsDto } from './dto/booking-reference-params.dto';
import { ApplyRewardPointsDto } from '../rewards/dto/reward-booking-redemption.dto';

@ApiTags('My Health Check payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@ApiUnauthorizedResponse()
@ApiNotFoundResponse({ description: 'No Health Check belongs to the authenticated SELF Patient.' })
@Controller('me/health-checks/:reference/payment')
export class MeHealthCheckPaymentsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly payments: PaymentFlowService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select funding and initialize payment for an owned Health Check' })
  @ApiOkResponse({ type: PublicPaymentInitiationResponseDto })
  @ApiConflictResponse()
  async initialize(
    @Req() request: { user: User },
    @Param() { reference }: BookingReferenceParamsDto,
    @Body() dto: PublicCheckoutSelectionDto,
  ): Promise<PublicPaymentInitiationResponseDto> {
    await this.bookings.requireSelfBooking(request.user, reference);
    const option = dto?.option ?? CheckoutFundingOption.PAY_NOW;
    const funding = await this.payments.initializeFunding(reference, request.user.id, option);
    if (option === CheckoutFundingOption.PAY_LATER)
      return PublicPaymentInitiationResponseDto.fromOperation(funding, option);
    return PublicPaymentInitiationResponseDto.fromOperation(
      await this.payments.initiatePatientPayment(reference, option, dto?.paymentEmail),
      option,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Read authoritative payment status for an owned Health Check' })
  @ApiOkResponse({ type: PublicPaymentStatusResponseDto })
  async status(
    @Req() request: { user: User },
    @Param() { reference }: BookingReferenceParamsDto,
  ): Promise<PublicPaymentStatusResponseDto> {
    await this.bookings.requireSelfBooking(request.user, reference);
    return this.payments.getPublicPaymentStatus(reference);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the stored provider payment and recover matching after settlement' })
  @ApiOkResponse({ type: PublicPaymentStatusResponseDto })
  @ApiConflictResponse()
  @ApiTooManyRequestsResponse()
  async verify(
    @Req() request: { user: User },
    @Param() { reference }: BookingReferenceParamsDto,
  ): Promise<PublicPaymentStatusResponseDto> {
    await this.bookings.requireSelfBooking(request.user, reference);
    return this.payments.verifyLatestBookingPayment(reference, request.user.id);
  }
}

@ApiTags('My Health Check reward redemption')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/health-checks/:reference/rewards')
export class MeHealthCheckRewardsController {
  constructor(private readonly bookings: BookingsService, private readonly payments: PaymentFlowService) {}
  @Get('preview') @ApiOperation({ summary: 'Preview server-authoritative reward redemption limits' })
  async preview(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { await this.bookings.requireSelfBooking(request.user, reference); return this.payments.previewRewardRedemption(reference, request.user.id); }
  @Post('apply') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Reserve reward points toward an owned Health Check' })
  async apply(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto, @Body() body: ApplyRewardPointsDto) { await this.bookings.requireSelfBooking(request.user, reference); return this.payments.applyRewardPoints(reference, request.user.id, body.points); }
  @Delete() @ApiOperation({ summary: 'Release an unsettled Health Check reward reservation' })
  async release(@Req() request: { user: User }, @Param() { reference }: BookingReferenceParamsDto) { await this.bookings.requireSelfBooking(request.user, reference); return this.payments.releaseRewardPoints(reference, request.user.id); }
}
