import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { AdminHealthCheckCatalogueService } from "./admin-health-check-catalogue.service";
import {
  AddPackageAddonDto,
  AddPackageContentDto,
  AdminClinicalContentQueryDto,
  CreateAdminClinicalContentDto,
  CreateAdminHealthCheckPackageDto,
  ReorderPackageContentsDto,
  UpdateAdminClinicalContentDto,
  UpdateAdminHealthCheckPackageDto,
} from "./dto/admin-health-check-catalogue.dto";

@ApiTags("Admin Health Check catalogue")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/health-check-catalogue")
export class AdminHealthCheckCatalogueController {
  constructor(private readonly catalogue: AdminHealthCheckCatalogueService) {}

  @Get("packages") listPackages() {
    return this.catalogue.listPackages();
  }
  @Post("packages") createPackage(
    @Body() dto: CreateAdminHealthCheckPackageDto,
    @Req() req: { user: User },
  ) {
    return this.catalogue.createPackage(dto, req.user.id);
  }
  @Get("packages/:code") packageDetail(@Param("code") code: string) {
    return this.catalogue.packageDetail(code);
  }
  @Patch("packages/:code") updatePackage(
    @Param("code") code: string,
    @Body() dto: UpdateAdminHealthCheckPackageDto,
    @Req() req: { user: User },
  ) {
    return this.catalogue.updatePackage(code, dto, req.user.id);
  }
  @Post("packages/:code/activate") activatePackage(
    @Param("code") code: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setPackageActive(code, true, req.user.id);
  }
  @Post("packages/:code/deactivate") deactivatePackage(
    @Param("code") code: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setPackageActive(code, false, req.user.id);
  }

  @Get("clinical-contents") listContents(
    @Query() query: AdminClinicalContentQueryDto,
  ) {
    return this.catalogue.listContents(query);
  }
  @Post("clinical-contents") createContent(
    @Body() dto: CreateAdminClinicalContentDto,
    @Req() req: { user: User },
  ) {
    return this.catalogue.createContent(dto, req.user.id);
  }
  @Get("clinical-contents/:reference") contentDetail(
    @Param("reference") reference: string,
  ) {
    return this.catalogue.contentDetail(reference);
  }
  @Patch("clinical-contents/:reference") updateContent(
    @Param("reference") reference: string,
    @Body() dto: UpdateAdminClinicalContentDto,
    @Req() req: { user: User },
  ) {
    return this.catalogue.updateContent(reference, dto, req.user.id);
  }
  @Post("clinical-contents/:reference/activate") activateContent(
    @Param("reference") reference: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setContentActive(reference, true, req.user.id);
  }
  @Post("clinical-contents/:reference/deactivate") deactivateContent(
    @Param("reference") reference: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setContentActive(reference, false, req.user.id);
  }

  @Post("packages/:code/included-contents") addIncluded(
    @Param("code") code: string,
    @Body() dto: AddPackageContentDto,
    @Req() req: { user: User },
  ) {
    return this.catalogue.addIncludedContent(code, dto, req.user.id);
  }
  @Post("packages/:code/included-contents/:reference/activate")
  activateIncluded(
    @Param("code") code: string,
    @Param("reference") reference: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setIncludedContentActive(
      code,
      reference,
      true,
      req.user.id,
    );
  }
  @Post("packages/:code/included-contents/:reference/deactivate")
  deactivateIncluded(
    @Param("code") code: string,
    @Param("reference") reference: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setIncludedContentActive(
      code,
      reference,
      false,
      req.user.id,
    );
  }
  @Post("packages/:code/included-contents/reorder") reorder(
    @Param("code") code: string,
    @Body() dto: ReorderPackageContentsDto,
    @Req() req: { user: User },
  ) {
    return this.catalogue.reorderIncludedContents(code, dto, req.user.id);
  }

  @Post("packages/:code/optional-addons") addAddon(
    @Param("code") code: string,
    @Body() dto: AddPackageAddonDto,
    @Req() req: { user: User },
  ) {
    return this.catalogue.addOptionalAddon(code, dto, req.user.id);
  }
  @Post("packages/:code/optional-addons/:reference/activate") activateAddon(
    @Param("code") code: string,
    @Param("reference") reference: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setOptionalAddonActive(
      code,
      reference,
      true,
      req.user.id,
    );
  }
  @Post("packages/:code/optional-addons/:reference/deactivate") deactivateAddon(
    @Param("code") code: string,
    @Param("reference") reference: string,
    @Req() req: { user: User },
  ) {
    return this.catalogue.setOptionalAddonActive(
      code,
      reference,
      false,
      req.user.id,
    );
  }
}
