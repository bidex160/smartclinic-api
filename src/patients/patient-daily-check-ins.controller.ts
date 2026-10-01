import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from "@nestjs/swagger";
import { isTimeZone } from "class-validator";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import {
  DailyCareProgressDto,
  DailyCheckInListDto,
  UpsertDailyCheckInDto,
} from "./dto/patient-daily-routine.dto";
import { PatientDailyCheckInsService } from "./patient-daily-check-ins.service";

@ApiTags("My daily care")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/daily-care/check-ins")
export class PatientDailyCheckInsController {
  constructor(private readonly service: PatientDailyCheckInsService) {}

  @Get()
  @ApiQuery({ name: "days", required: false, description: "1–31, default 7" })
  @ApiQuery({ name: "timezone", required: false, example: "Africa/Lagos" })
  @ApiOkResponse({ type: DailyCheckInListDto })
  list(
    @Req() req: { user: User },
    @Query("days") days?: string,
    @Query("timezone") timezone = "Africa/Lagos",
  ) {
    if (!isTimeZone(timezone)) throw new BadRequestException("timezone must be a valid IANA time zone");
    return this.service.list(req.user, Number(days ?? 7), timezone);
  }

  @Put("today")
  @ApiOkResponse({ type: DailyCareProgressDto })
  upsertToday(@Req() req: { user: User }, @Body() dto: UpsertDailyCheckInDto) {
    return this.service.upsertToday(req.user, dto);
  }
}
