import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { UserRole } from "../users/enums/user-role.enum";
import {
  AdminProviderDetailResponseDto,
  AdminProviderListQueryDto,
  AdminProviderListResponseDto,
  CreateAdminProviderDto,
  LinkProviderUserDto,
  UpdateAdminProviderDto,
} from "./dto/admin-provider-management.dto";
import { ResourceIdParamsDto } from "./dto/provider-params.dto";
import { AdminProvidersService } from "./admin-providers.service";

@ApiTags("Admin providers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiBadRequestResponse()
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@Controller("admin/providers")
export class AdminProvidersController {
  constructor(private readonly providers: AdminProvidersService) {}
  @Get()
  @ApiOperation({
    summary:
      "List providers for onboarding and operations (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderListResponseDto })
  list(@Query() query: AdminProviderListQueryDto) {
    return this.providers.list(query);
  }
  @Get(":id")
  @ApiOperation({
    summary: "Get a safe operational provider profile (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  get(@Param() { id }: ResourceIdParamsDto) {
    return this.providers.get(id);
  }
  @Post()
  @ApiOperation({
    summary: "Create an unlinked pending provider (ADMIN or OPERATIONS)",
  })
  @ApiCreatedResponse({ type: AdminProviderDetailResponseDto })
  create(@Body() dto: CreateAdminProviderDto) {
    return this.providers.create(dto);
  }
  @Patch(":id")
  @ApiOperation({
    summary: "Update basic provider profile data (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  update(
    @Param() { id }: ResourceIdParamsDto,
    @Body() dto: UpdateAdminProviderDto,
  ) {
    return this.providers.update(id, dto);
  }
  @Patch(":id/activate")
  @ApiOperation({
    summary: "Activate a provider operationally (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  activate(@Param() { id }: ResourceIdParamsDto) {
    return this.providers.activate(id);
  }
  @Patch(":id/suspend")
  @ApiOperation({
    summary: "Suspend a provider operationally (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  suspend(@Param() { id }: ResourceIdParamsDto) {
    return this.providers.suspend(id);
  }
  @Post(":id/link-user")
  @ApiOperation({
    summary:
      "Link an existing active user and grant PROVIDER role (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  link(@Param() { id }: ResourceIdParamsDto, @Body() dto: LinkProviderUserDto) {
    return this.providers.linkUser(id, dto.userId);
  }
  @Post(":id/unlink-user")
  @ApiOperation({
    summary:
      "Safely unlink the provider account and remove PROVIDER role (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  unlink(@Param() { id }: ResourceIdParamsDto) {
    return this.providers.unlinkUser(id);
  }
}
