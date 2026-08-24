import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { BookingLifecycleService } from "./booking-lifecycle.service";
import { AdminBookingLifecycleResponseDto } from "./dto/admin-booking-lifecycle-response.dto";
import { BookingReferenceParamsDto } from "./dto/booking-reference-params.dto";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { RescheduleBookingDto } from "./dto/reschedule-booking.dto";

@ApiTags("Admin booking lifecycle")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@Controller("admin/bookings")
export class AdminBookingLifecycleController {
  constructor(private readonly lifecycle: BookingLifecycleService) {}
  @Post(":reference/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Cancel a booking and close its provider work (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminBookingLifecycleResponseDto })
  cancel(
    @Param() p: BookingReferenceParamsDto,
    @Req() request: { user: User },
    @Body() dto: CancelBookingDto,
  ) {
    return this.lifecycle.cancelBooking(p.reference, request.user.id, dto);
  }
  @Post(":reference/reschedule")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Reschedule a booking and require fresh matching where assigned (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminBookingLifecycleResponseDto })
  reschedule(
    @Param() p: BookingReferenceParamsDto,
    @Req() request: { user: User },
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.lifecycle.rescheduleBooking(p.reference, request.user.id, dto);
  }
}
