import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; import { Roles } from '../auth/roles.decorator'; import { RolesGuard } from '../auth/roles.guard'; import { BookingReferenceParamsDto } from '../bookings/dto/booking-reference-params.dto'; import { ResourceIdParamsDto } from '../providers/dto/provider-params.dto'; import { User } from '../users/entities/user.entity'; import { UserRole } from '../users/enums/user-role.enum'; import { InitiatePaymentDto } from './dto/initiate-payment.dto'; import { PaymentOperationResponseDto } from './dto/payment-operation-response.dto'; import { PaymentFlowService } from './payment-flow.service';

@ApiTags('Admin payment flow') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS) @ApiUnauthorizedResponse() @ApiForbiddenResponse() @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse() @Controller('admin')
export class AdminPaymentFlowController {
  constructor(private readonly payments: PaymentFlowService) {}
  @Post('bookings/:reference/funding/initialize') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Initialize self-funding from the booking quote' }) @ApiOkResponse({ type: PaymentOperationResponseDto })
  initialize(@Param() p: BookingReferenceParamsDto, @Req() req: { user: User }) { return this.payments.initializeFunding(p.reference, req.user.id); }
  @Post('bookings/:reference/payments/initiate-test') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Initiate a test-adapter payment (non-production only)' }) @ApiOkResponse({ type: PaymentOperationResponseDto })
  initiate(@Param() p: BookingReferenceParamsDto, @Body() dto: InitiatePaymentDto) { this.assertTestEndpoint(); return this.payments.initiatePayment(p.reference, dto.idempotencyKey); }
  @Post('payment-attempts/:id/confirm-test') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Verify a test-adapter payment (non-production only)' }) @ApiOkResponse({ type: PaymentOperationResponseDto })
  confirm(@Param() p: ResourceIdParamsDto, @Req() req: { user: User }) { this.assertTestEndpoint(); return this.payments.confirmPayment(p.id, req.user.id); }
  private assertTestEndpoint() { if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Test payment operations are disabled in production'); }
}
