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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { ClinicalRecordAccessService } from "./clinical-record-access.service";
import {
  ClinicalAccessListQueryDto,
  ClinicalRecordAccessProviderListQueryDto,
  ClinicalRecordAccessGrantParamsDto,
  CreateClinicalRecordAccessGrantDto,
} from "./dto/clinical-record-access.dto";
import { ClinicalRecordAttachmentParamsDto } from "./dto/clinical-record-attachment.dto";
import { ClinicalRecordReferenceParamsDto } from "./dto/clinical-record.dto";
@ApiTags("My Clinical Record Access")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller("me")
export class MeClinicalRecordAccessController {
  constructor(private readonly access: ClinicalRecordAccessService) {}
  @Get("clinical-record-access-providers")
  @ApiOperation({
    summary: "List operational Providers eligible for Clinical Record sharing",
  })
  providers(
    @Req() req: { user: User },
    @Query() query: ClinicalRecordAccessProviderListQueryDto,
  ) {
    return this.access.listEligibleProviders(req.user, query);
  }
  @Post("clinical-record-access-grants")
  @ApiOperation({
    summary:
      "Grant an operational Provider explicit access to Clinical Records",
  })
  create(
    @Req() req: { user: User },
    @Body() dto: CreateClinicalRecordAccessGrantDto,
  ) {
    return this.access.createGrant(req.user, dto);
  }
  @Get("clinical-record-access-grants") list(
    @Req() req: { user: User },
    @Query() query: ClinicalAccessListQueryDto,
  ) {
    return this.access.listGrants(req.user, query);
  }
  @Get("clinical-record-access-grants/:reference") get(
    @Req() req: { user: User },
    @Param() params: ClinicalRecordAccessGrantParamsDto,
  ) {
    return this.access.getGrant(req.user, params.reference);
  }
  @Post("clinical-record-access-grants/:reference/revoke") revoke(
    @Req() req: { user: User },
    @Param() params: ClinicalRecordAccessGrantParamsDto,
  ) {
    return this.access.revokeGrant(req.user, params.reference);
  }
  @Get("clinical-record-access-audit") audit(
    @Req() req: { user: User },
    @Query() query: ClinicalAccessListQueryDto,
  ) {
    return this.access.listAudit(req.user, query);
  }
}
@ApiTags("Provider Shared Clinical Records")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller("provider/shared-clinical-records")
export class ProviderSharedClinicalRecordsController {
  constructor(private readonly access: ClinicalRecordAccessService) {}
  @Get() list(
    @Req() req: { user: User },
    @Query() query: ClinicalAccessListQueryDto,
  ) {
    return this.access.listShared(req.user, query);
  }
  @Get(":reference") get(
    @Req() req: { user: User },
    @Param() params: ClinicalRecordReferenceParamsDto,
  ) {
    return this.access.getShared(req.user, params.reference);
  }
  @Get(":recordReference/attachments/:attachmentReference/access") attachment(
    @Req() req: { user: User },
    @Param() params: ClinicalRecordAttachmentParamsDto,
  ) {
    return this.access.sharedAttachmentAccess(
      req.user,
      params.recordReference,
      params.attachmentReference,
    );
  }
}
