import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
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
import { User } from "../users/entities/user.entity";
import {
  AdminProviderDetailResponseDto,
  AdminCreatedProviderResponseDto,
  AdminProviderListQueryDto,
  AdminProviderListResponseDto,
  CreateAdminProviderDto,
  LinkProviderUserDto,
  RejectProviderDto,
  UpdateAdminProviderDto,
} from "./dto/admin-provider-management.dto";
import { ResourceIdParamsDto } from "./dto/provider-params.dto";
import { AdminProvidersService } from "./admin-providers.service";
import { ProviderInvitationsService } from "./provider-invitations.service";

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
  constructor(private readonly providers: AdminProvidersService, private readonly invitations: ProviderInvitationsService) {}
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
    summary: "Create a pending provider and deliver its initial invitation (ADMIN or OPERATIONS)",
  })
  @ApiCreatedResponse({ type: AdminCreatedProviderResponseDto })
  create(@Body() dto: CreateAdminProviderDto, @Req() request: { user: User }) {
    return this.invitations.createProvider(dto, request.user.id);
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
  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve submitted onboarding and activate the provider" })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  approve(@Param() { id }: ResourceIdParamsDto, @Req() request: { user: User }) { return this.providers.approve(id, request.user.id); }
  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject submitted onboarding without deleting the account" })
  @ApiOkResponse({ type: AdminProviderDetailResponseDto })
  reject(@Param() { id }: ResourceIdParamsDto, @Req() request: { user: User }, @Body() dto: RejectProviderDto) { return this.providers.reject(id, request.user.id, dto.reviewNote); }
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
