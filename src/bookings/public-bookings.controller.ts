import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { Request, Response } from "express";

import { BookingResponseDto } from "./dto/booking-response.dto";
import { CreatePublicBookingDto } from "./dto/create-public-booking.dto";
import { PublicBookingsService } from "./public-bookings.service";
import { BookingReferenceParamsDto } from "./dto/booking-reference-params.dto";
import {
  PUBLIC_BOOKING_SESSION_COOKIE,
  PublicBookingSessionService,
} from "./public-booking-session.service";
import { PaymentFlowService } from "../payments/payment-flow.service";
import { PublicPaymentInitiationResponseDto } from "../payments/dto/public-payment-initiation-response.dto";
import { PublicPaymentStatusResponseDto } from "../payments/dto/public-payment-status-response.dto";

@ApiTags("Public bookings")
@Controller("public/bookings")
export class PublicBookingsController {
  constructor(
    private readonly publicBookingsService: PublicBookingsService,
    private readonly sessions: PublicBookingSessionService,
    private readonly payments: PaymentFlowService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a draft booking without a registered SmartClinic account",
  })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: "The input or selected catalogue items are invalid.",
  })
  @ApiUnprocessableEntityResponse({
    description:
      "No current catalogue price is available for the selected package and fulfilment mode.",
  })
  @ApiConflictResponse({
    description: "A booking reference could not be generated.",
  })
  async create(
    @Body() dto: CreatePublicBookingDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingResponseDto> {
    const created = await this.publicBookingsService.create(dto);
    response.cookie(
      PUBLIC_BOOKING_SESSION_COOKIE,
      created.sessionToken,
      this.sessions.cookieOptions(),
    );
    return created.booking;
  }
  @Get(":reference")
  @ApiCookieAuth(PUBLIC_BOOKING_SESSION_COOKIE)
  @ApiOperation({
    summary: "Retrieve the booking controlled by the guest session",
  })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiUnauthorizedResponse()
  get(@Param() p: BookingReferenceParamsDto, @Req() request: Request) {
    return this.sessions.resolveBooking(this.readCookie(request), p.reference);
  }
  @Post(":reference/funding/initialize")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(PUBLIC_BOOKING_SESSION_COOKIE)
  @ApiOperation({ summary: "Initialize quote-backed guest self-funding" })
  @ApiUnauthorizedResponse()
  async initializeFunding(
    @Param() p: BookingReferenceParamsDto,
    @Req() request: Request,
  ) {
    await this.sessions.resolveBooking(this.readCookie(request), p.reference);
    return this.payments.initializeFunding(p.reference, null);
  }
  @Post(":reference/payment/initiate")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(PUBLIC_BOOKING_SESSION_COOKIE)
  @ApiOperation({ summary: "Initialize a provider-neutral public checkout" })
  @ApiOkResponse({ type: PublicPaymentInitiationResponseDto })
  @ApiUnauthorizedResponse()
  async initiatePayment(
    @Param() p: BookingReferenceParamsDto,
    @Req() request: Request,
  ) {
    await this.sessions.resolveBooking(this.readCookie(request), p.reference);
    await this.payments.initializeFunding(p.reference, null);
    return PublicPaymentInitiationResponseDto.fromOperation(
      await this.payments.initiatePublicPayment(p.reference),
    );
  }
  @Get(":reference/payment-status")
  @ApiCookieAuth(PUBLIC_BOOKING_SESSION_COOKIE)
  @ApiOperation({ summary: "Read authoritative SmartClinic payment status" })
  @ApiOkResponse({ type: PublicPaymentStatusResponseDto })
  @ApiUnauthorizedResponse()
  async paymentStatus(
    @Param() p: BookingReferenceParamsDto,
    @Req() request: Request,
  ): Promise<PublicPaymentStatusResponseDto> {
    await this.sessions.resolveBooking(this.readCookie(request), p.reference);
    return this.payments.getPublicPaymentStatus(p.reference);
  }
  @Post(":reference/payment-status/refresh")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(PUBLIC_BOOKING_SESSION_COOKIE)
  @ApiOperation({
    summary:
      "Reconcile the latest booking payment with the configured provider",
  })
  @ApiOkResponse({ type: PublicPaymentStatusResponseDto })
  @ApiConflictResponse()
  @ApiTooManyRequestsResponse()
  @ApiUnauthorizedResponse()
  async refreshPaymentStatus(
    @Param() p: BookingReferenceParamsDto,
    @Req() request: Request,
  ): Promise<PublicPaymentStatusResponseDto> {
    await this.sessions.resolveBooking(this.readCookie(request), p.reference);
    return this.payments.verifyLatestBookingPayment(p.reference);
  }
  private readCookie(request: Request): string | null {
    const prefix = `${PUBLIC_BOOKING_SESSION_COOKIE}=`;
    const entry = request.headers.cookie
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix));
    if (!entry) return null;
    try {
      return decodeURIComponent(entry.slice(prefix.length));
    } catch {
      return null;
    }
  }
}
