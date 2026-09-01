import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import {
  CancelGuidedSelfCheckContactWorkItemDto,
  CompleteGuidedSelfCheckContactWorkItemDto,
  GuidedSelfCheckContactWorkItemListQueryDto,
} from "./dto/guided-self-check-contact-work-item.dto";
import { GuidedSelfCheckContactWorkItemsService } from "./guided-self-check-contact-work-items.service";

@ApiTags("Internal Guided Self-Check professional contact")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller("admin/guided-self-check-contact-work-items")
export class GuidedSelfCheckContactWorkItemsController {
  constructor(private contacts: GuidedSelfCheckContactWorkItemsService) {}
  @Get() list(@Query() q: GuidedSelfCheckContactWorkItemListQueryDto) {
    return this.contacts.list(q);
  }
  @Get(":reference") get(@Param("reference") ref: string) {
    return this.contacts.get(ref);
  }
  @Post(":reference/acknowledge") acknowledge(
    @Param("reference") ref: string,
    @Req() r: { user: User },
  ) {
    return this.contacts.acknowledge(ref, r.user.id);
  }
  @Post(":reference/start") start(
    @Param("reference") ref: string,
    @Req() r: { user: User },
  ) {
    return this.contacts.start(ref, r.user.id);
  }
  @Post(":reference/complete") complete(
    @Param("reference") ref: string,
    @Body() dto: CompleteGuidedSelfCheckContactWorkItemDto,
    @Req() r: { user: User },
  ) {
    return this.contacts.complete(ref, r.user.id, dto.outcome, dto.note);
  }
  @Post(":reference/cancel") cancel(
    @Param("reference") ref: string,
    @Body() dto: CancelGuidedSelfCheckContactWorkItemDto,
    @Req() r: { user: User },
  ) {
    return this.contacts.cancel(ref, r.user.id, dto.reason);
  }
}
