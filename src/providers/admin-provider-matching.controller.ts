import {
  Controller,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { BookingReferenceParamsDto } from "../bookings/dto/booking-reference-params.dto";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import {
  AdminExpireStaleOffersResponseDto,
  AdminStartMatchingResponseDto,
} from "./dto/admin-matching-operation-response.dto";
import { AdminProviderAssignmentQueryDto } from "./dto/admin-provider-assignment-query.dto";
import { AdminProviderAssignmentResponseDto } from "./dto/admin-provider-assignment-response.dto";
import { ResourceIdParamsDto } from "./dto/provider-params.dto";
import { ProviderMatchingService } from "./provider-matching.service";
import { AdminProviderAssignmentsService } from "./admin-provider-assignments.service";
import { AdminMatchingQueueService } from "./admin-matching-queue.service";
import { AdminMatchingQueueQueryDto } from "./dto/admin-matching-queue-query.dto";
import { AdminMatchingQueueResponseDto } from "./dto/admin-matching-queue-response.dto";
import { AdminBookingDetailService } from "./admin-booking-detail.service";
import { AdminBookingDetailResponseDto } from "./dto/admin-booking-detail-response.dto";
import { ManualProviderAssignmentDto, OverrideProviderAssignmentDto, ReassignProviderDto } from "./dto/manual-provider-assignment.dto";

@ApiTags("Admin provider matching")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@Controller("admin")
export class AdminProviderMatchingController {
  constructor(
    private readonly matching: ProviderMatchingService,
    private readonly assignments: AdminProviderAssignmentsService,
    private readonly queue: AdminMatchingQueueService,
    private readonly bookingDetail: AdminBookingDetailService,
  ) {}
  @Get("bookings/matching-queue")
  @ApiOperation({
    summary:
      "List the read-only operational provider-matching queue (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminMatchingQueueResponseDto })
  matchingQueue(@Query() query: AdminMatchingQueueQueryDto) {
    return this.queue.list(query);
  }
  @Get("bookings/:reference")
  @ApiOperation({
    summary: "Get a minimized operational booking detail (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminBookingDetailResponseDto })
  booking(@Param() { reference }: BookingReferenceParamsDto) {
    return this.bookingDetail.get(reference);
  }
  @Get("provider-assignments")
  @ApiOperation({
    summary:
      "List provider assignments with operational context (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderAssignmentResponseDto, isArray: true })
  list(@Query() query: AdminProviderAssignmentQueryDto) {
    return this.assignments.list(query);
  }
  @Get("provider-assignments/:id")
  @ApiOperation({
    summary:
      "Get a provider assignment with operational context (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderAssignmentResponseDto })
  get(@Param() { id }: ResourceIdParamsDto) {
    return this.assignments.get(id);
  }
  @Post("bookings/:reference/matching/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Start or retry sequential provider matching (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminStartMatchingResponseDto })
  async start(
    @Param() { reference }: BookingReferenceParamsDto,
    @Req() request: { user: User },
  ) {
    return AdminStartMatchingResponseDto.fromDomain(
      reference,
      await this.matching.startMatching(reference, request.user.id),
    );
  }
  @Post("bookings/:reference/matching/retry")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Retry matching for an unfulfillable booking (ADMIN or OPERATIONS)" })
  @ApiOkResponse({ type: AdminStartMatchingResponseDto })
  async retry(@Param() { reference }: BookingReferenceParamsDto, @Req() request: { user: User }) {
    return AdminStartMatchingResponseDto.fromDomain(reference, await this.matching.retryMatching(reference, request.user.id));
  }
  @Post("bookings/:reference/assign-provider")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Offer a booking to a specifically selected eligible provider" })
  @ApiOkResponse({ type: AdminStartMatchingResponseDto })
  async assign(@Param() { reference }: BookingReferenceParamsDto, @Body() dto: ManualProviderAssignmentDto, @Req() request: { user: User }) {
    return AdminStartMatchingResponseDto.fromDomain(reference, await this.matching.assignEligibleProvider(reference, dto.providerId, request.user.id));
  }
  @Post("bookings/:reference/assign-provider/override")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exceptionally offer a booking to an active provider with an audited reason" })
  @ApiOkResponse({ type: AdminStartMatchingResponseDto })
  async override(@Param() { reference }: BookingReferenceParamsDto, @Body() dto: OverrideProviderAssignmentDto, @Req() request: { user: User }) {
    return AdminStartMatchingResponseDto.fromDomain(reference, await this.matching.assignProviderOverride(reference, dto.providerId, dto.reason, request.user.id));
  }
  @Post("bookings/:reference/reassign-provider")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Close the active assignment, release capacity, and rematch or offer a selected eligible provider" })
  @ApiOkResponse({ type: AdminStartMatchingResponseDto })
  async reassign(@Param() { reference }: BookingReferenceParamsDto, @Body() dto: ReassignProviderDto, @Req() request: { user: User }) {
    return AdminStartMatchingResponseDto.fromDomain(reference, await this.matching.reassign(reference, request.user.id, dto.reason, dto.providerId));
  }
  @Post("provider-assignments/:id/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm an accepted provider assignment (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderAssignmentResponseDto })
  async confirm(
    @Param() { id }: ResourceIdParamsDto,
    @Req() request: { user: User },
  ) {
    await this.matching.confirmAssignment(id, request.user.id);
    return this.assignments.get(id);
  }
  @Post("provider-assignments/expire-stale")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Expire stale offers and continue sequential matching (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminExpireStaleOffersResponseDto })
  async expire(@Req() request: { user: User }) {
    return AdminExpireStaleOffersResponseDto.fromDomain(
      await this.matching.expireStaleOffers(request.user.id),
    );
  }
}
