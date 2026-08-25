import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateProviderLocationDto } from "./dto/create-provider-location.dto";
import { ProviderLocationResponseDto } from "./dto/provider-location-response.dto";
import {
  ProviderIdParamsDto,
  ResourceIdParamsDto,
} from "./dto/provider-params.dto";
import { UpdateProviderLocationDto } from "./dto/update-provider-location.dto";
import { ProviderCapabilitiesService } from "./provider-capabilities.service";

@ApiTags("Admin provider locations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@Controller("admin")
export class AdminProviderLocationsController {
  constructor(private readonly capabilities: ProviderCapabilitiesService) {}
  @Get("providers/:providerId/locations")
  @ApiOperation({ summary: "List provider locations (ADMIN or OPERATIONS)" })
  @ApiOkResponse({ type: ProviderLocationResponseDto, isArray: true })
  list(@Param() { providerId }: ProviderIdParamsDto) {
    return this.capabilities.listLocations(providerId);
  }
  @Post("providers/:providerId/locations")
  @ApiOperation({ summary: "Create a provider location (ADMIN or OPERATIONS)" })
  @ApiCreatedResponse({ type: ProviderLocationResponseDto })
  create(
    @Param() { providerId }: ProviderIdParamsDto,
    @Body() dto: CreateProviderLocationDto,
  ) {
    return this.capabilities.createLocation(providerId, dto);
  }
  @Get("provider-locations/:id")
  @ApiOperation({ summary: "Get a provider location (ADMIN or OPERATIONS)" })
  @ApiOkResponse({ type: ProviderLocationResponseDto })
  get(@Param() { id }: ResourceIdParamsDto) {
    return this.capabilities.getLocation(id);
  }
  @Patch("provider-locations/:id")
  @ApiOperation({ summary: "Update a provider location (ADMIN or OPERATIONS)" })
  @ApiOkResponse({ type: ProviderLocationResponseDto })
  update(
    @Param() { id }: ResourceIdParamsDto,
    @Body() dto: UpdateProviderLocationDto,
  ) {
    return this.capabilities.updateLocation(id, dto);
  }
  @Patch("provider-locations/:id/activate")
  @ApiOperation({
    summary: "Activate a provider location (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: ProviderLocationResponseDto })
  activate(@Param() { id }: ResourceIdParamsDto) {
    return this.capabilities.activateLocation(id);
  }
  @Patch("provider-locations/:id/deactivate")
  @ApiOperation({
    summary: "Deactivate a provider location (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: ProviderLocationResponseDto })
  deactivate(@Param() { id }: ResourceIdParamsDto) {
    return this.capabilities.deactivateLocation(id);
  }
}
