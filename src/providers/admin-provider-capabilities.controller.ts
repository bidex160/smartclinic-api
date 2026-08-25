import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiNoContentResponse,
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
import { CreateProviderServiceDto } from "./dto/create-provider-service.dto";
import {
  ProviderIdParamsDto,
  ResourceIdParamsDto,
  ServiceLocationParamsDto,
} from "./dto/provider-params.dto";
import { ProviderServiceResponseDto } from "./dto/provider-service-response.dto";
import { ProviderCapabilitiesService } from "./provider-capabilities.service";

@ApiTags("Admin provider services")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@Controller("admin")
export class AdminProviderCapabilitiesController {
  constructor(private readonly capabilities: ProviderCapabilitiesService) {}
  @Get("providers/:providerId/services")
  @ApiOperation({ summary: "List provider capabilities (ADMIN or OPERATIONS)" })
  @ApiOkResponse({ type: ProviderServiceResponseDto, isArray: true })
  list(@Param() { providerId }: ProviderIdParamsDto) {
    return this.capabilities.listServices(providerId);
  }
  @Post("providers/:providerId/services")
  @ApiOperation({
    summary: "Create a provider capability (ADMIN or OPERATIONS)",
  })
  @ApiCreatedResponse({ type: ProviderServiceResponseDto })
  create(
    @Param() { providerId }: ProviderIdParamsDto,
    @Body() dto: CreateProviderServiceDto,
  ) {
    return this.capabilities.createService(providerId, dto);
  }
  @Get("provider-services/:id")
  @ApiOperation({ summary: "Get a provider capability (ADMIN or OPERATIONS)" })
  @ApiOkResponse({ type: ProviderServiceResponseDto })
  get(@Param() { id }: ResourceIdParamsDto) {
    return this.capabilities.getService(id);
  }
  @Patch("provider-services/:id/activate")
  @ApiOperation({
    summary: "Activate a provider capability (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: ProviderServiceResponseDto })
  activate(@Param() { id }: ResourceIdParamsDto) {
    return this.capabilities.activateService(id);
  }
  @Patch("provider-services/:id/deactivate")
  @ApiOperation({
    summary: "Deactivate a provider capability (ADMIN or OPERATIONS)",
  })
  @ApiOkResponse({ type: ProviderServiceResponseDto })
  deactivate(@Param() { id }: ResourceIdParamsDto) {
    return this.capabilities.deactivateService(id);
  }
  @Post("provider-services/:id/locations/:locationId")
  @ApiOperation({
    summary: "Link a location to a provider capability (ADMIN or OPERATIONS)",
  })
  @ApiCreatedResponse({ type: ProviderServiceResponseDto })
  link(@Param() { id, locationId }: ServiceLocationParamsDto) {
    return this.capabilities.linkLocation(id, locationId);
  }
  @Delete("provider-services/:id/locations/:locationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Unlink a location from a provider capability (ADMIN or OPERATIONS)",
  })
  @ApiNoContentResponse()
  unlink(@Param() { id, locationId }: ServiceLocationParamsDto) {
    return this.capabilities.unlinkLocation(id, locationId);
  }
}
