import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminCareRequestQueryDto, AssignCareRequestDto, CareRequestListQueryDto, CareRequestReasonDto, CareRequestReferenceParamsDto, CreateCareRequestDto } from './dto/care-request.dto';
import { CareRequestsService } from './care-requests.service';

@ApiTags('My Care Requests') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @Controller('me/care-requests')
export class MeCareRequestsController {
  constructor(private readonly requests: CareRequestsService) {}
  @Post() @ApiOperation({ summary: 'Submit a Care Request for the authenticated SELF Patient' }) create(@Req() req: { user: User }, @Body() dto: CreateCareRequestDto) { return this.requests.create(req.user, dto); }
  @Get() list(@Req() req: { user: User }, @Query() query: CareRequestListQueryDto) { return this.requests.listMine(req.user, query); }
  @Get(':reference') get(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto) { return this.requests.getMine(req.user, p.reference); }
  @Post(':reference/cancel') cancel(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto) { return this.requests.cancelMine(req.user, p.reference); }
}

@ApiTags('Provider Care Requests') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider/care-requests')
export class ProviderCareRequestsController {
  constructor(private readonly requests: CareRequestsService) {}
  @Get() list(@Req() req: { user: User }, @Query() query: CareRequestListQueryDto) { return this.requests.listForProvider(req.user, query); }
  @Get(':reference') get(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto) { return this.requests.getForProvider(req.user, p.reference); }
  @Post(':reference/accept') accept(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto) { return this.requests.providerRespond(req.user, p.reference, true, null); }
  @Post(':reference/decline') decline(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto, @Body() dto: CareRequestReasonDto) { return this.requests.providerRespond(req.user, p.reference, false, dto.reason); }
}

@ApiTags('Admin Care Requests') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS) @Controller('admin/care-requests')
export class AdminCareRequestsController {
  constructor(private readonly requests: CareRequestsService) {}
  @Get() list(@Query() query: AdminCareRequestQueryDto) { return this.requests.adminList(query); }
  @Get(':reference') get(@Param() p: CareRequestReferenceParamsDto) { return this.requests.adminGet(p.reference); }
  @Post(':reference/assign') assign(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto, @Body() dto: AssignCareRequestDto) { return this.requests.assign(p.reference, req.user.id, dto); }
  @Post(':reference/unfulfillable') unfulfillable(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto, @Body() dto: CareRequestReasonDto) { return this.requests.markUnfulfillable(p.reference, req.user.id, dto.reason); }
}
