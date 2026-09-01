import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { SaveGuidedSelfCheckAnswerDto } from "./dto/guided-self-check-answer.dto";
import { UpdateGuidedSelfCheckProductDto } from "./dto/guided-self-check.dto";
import { GuidedSelfCheckClassificationsService } from "./guided-self-check-classifications.service";
import { GuidedSelfCheckNextActionsService } from "./guided-self-check-next-actions.service";
import { GuidedSelfCheckQuestionnairesService } from "./guided-self-check-questionnaires.service";
import { GuidedSelfChecksService } from "./guided-self-checks.service";
@ApiTags("Guided Self-Check product")
@Controller("guided-self-check")
export class GuidedSelfCheckProductController {
  constructor(private s: GuidedSelfChecksService) {}
  @Get("product") get() {
    return this.s.getProduct();
  }
}
@ApiTags("My Guided Self-Checks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me/guided-self-checks")
export class MeGuidedSelfChecksController {
  constructor(
    private s: GuidedSelfChecksService,
    private q: GuidedSelfCheckQuestionnairesService,
    private classifications: GuidedSelfCheckClassificationsService,
    private actions: GuidedSelfCheckNextActionsService,
  ) {}
  @Post() create(@Req() r: { user: User }) {
    return this.s.create(r.user.id);
  }
  @Get() list(@Req() r: { user: User }) {
    return this.s.list(r.user.id);
  }
  @Get(":reference") async get(
    @Param("reference") ref: string,
    @Req() r: { user: User },
  ) {
    return {
      ...(await this.s.get(ref, r.user.id)),
      ...(await this.classifications.getPatientResult(ref, r.user.id)),
      nextAction: await this.actions.patientForReference(ref, r.user.id),
    };
  }
  @Post(":reference/start") start(
    @Param("reference") ref: string,
    @Req() r: { user: User },
  ) {
    return this.q.start(ref, r.user.id);
  }
  @Get(":reference/questionnaire") questionnaire(
    @Param("reference") ref: string,
    @Req() r: { user: User },
  ) {
    return this.q.get(ref, r.user.id);
  }
  @Put(":reference/answers/:questionKey") save(
    @Param("reference") ref: string,
    @Param("questionKey") key: string,
    @Req() r: { user: User },
    @Body() dto: SaveGuidedSelfCheckAnswerDto,
  ) {
    return this.q.save(ref, key, r.user.id, dto);
  }
  @Post(":reference/complete") async complete(
    @Param("reference") ref: string,
    @Req() r: { user: User },
  ) {
    await this.q.complete(ref, r.user.id);
    const classified = await this.classifications.classifyCompleted(ref);
    if (classified) await this.actions.ensureForReference(ref);
    return {
      ...(await this.q.get(ref, r.user.id)),
      ...(await this.classifications.getPatientResult(ref, r.user.id)),
      nextAction: await this.actions.patientForReference(ref, r.user.id),
    };
  }
}
@ApiTags("Admin Guided Self-Check")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller("admin/guided-self-check/product")
export class AdminGuidedSelfCheckController {
  constructor(private s: GuidedSelfChecksService) {}
  @Get() get() {
    return this.s.getAdminProduct();
  }
  @Patch() update(@Body() dto: UpdateGuidedSelfCheckProductDto) {
    return this.s.updateProduct(dto);
  }
}
@ApiTags("Admin Guided Self-Check classifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller("admin/guided-self-checks")
export class AdminGuidedSelfCheckClassificationsController {
  constructor(private classifications: GuidedSelfCheckClassificationsService) {}
  @Get(":reference/classification") get(@Param("reference") ref: string) {
    return this.classifications.getInternalResult(ref);
  }
}
