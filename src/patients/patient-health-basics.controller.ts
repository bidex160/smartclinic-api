import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { PatientHealthBasicsDto, UpdatePatientHealthBasicsDto } from "./dto/patient-health-basics.dto";
import { PatientHealthBasicsService } from "./patient-health-basics.service";

@ApiTags("My health basics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/health-basics")
export class PatientHealthBasicsController {
  constructor(private readonly service: PatientHealthBasicsService) {}

  @Get()
  @ApiOkResponse({ type: PatientHealthBasicsDto })
  get(@Req() req: { user: User }) {
    return this.service.get(req.user);
  }

  @Put()
  @ApiOkResponse({ type: PatientHealthBasicsDto })
  update(@Req() req: { user: User }, @Body() dto: UpdatePatientHealthBasicsDto) {
    return this.service.update(req.user, dto);
  }
}
