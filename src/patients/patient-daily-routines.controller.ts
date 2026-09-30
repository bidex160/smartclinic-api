import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import {
  CreatePatientDailyRoutineDto,
  PatientDailyRoutineDto,
  PatientDailyRoutineListDto,
  UpdatePatientDailyRoutineDto,
} from "./dto/patient-daily-routine.dto";
import { PatientDailyRoutinesService } from "./patient-daily-routines.service";

@ApiTags("My daily care")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/daily-care/routines")
export class PatientDailyRoutinesController {
  constructor(private readonly service: PatientDailyRoutinesService) {}
  @Get() @ApiOkResponse({ type: PatientDailyRoutineListDto }) list(
    @Req() req: { user: User },
  ) {
    return this.service.list(req.user);
  }
  @Post() @ApiCreatedResponse({ type: PatientDailyRoutineDto }) create(
    @Req() req: { user: User },
    @Body() dto: CreatePatientDailyRoutineDto,
  ) {
    return this.service.create(req.user, dto);
  }
  @Patch(":reference") @ApiOkResponse({ type: PatientDailyRoutineDto }) update(
    @Req() req: { user: User },
    @Param("reference") reference: string,
    @Body() dto: UpdatePatientDailyRoutineDto,
  ) {
    return this.service.update(req.user, reference, dto);
  }
  @Delete(":reference") @HttpCode(204) @ApiNoContentResponse() async remove(
    @Req() req: { user: User },
    @Param("reference") reference: string,
  ) {
    await this.service.remove(req.user, reference);
  }
}
