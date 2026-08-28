import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PaymentFlowService } from '../payments/payment-flow.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CareRequestReferenceParamsDto } from '../care-requests/dto/care-request.dto';
import { AdminFastTrackQueryDto, CreateExternalFastTrackDto, FastTrackListQueryDto, FastTrackReasonDto, FastTrackReferenceParamsDto } from './dto/fasttrack.dto';
import { FastTrackService } from './fasttrack.service';

@ApiTags('My FastTrack') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @Controller('me')
export class MeFastTrackController {
  constructor(private readonly fasttrack: FastTrackService, private readonly payments: PaymentFlowService) {}
  @Post('care-requests/:reference/fasttrack') @ApiOperation({ summary: 'Create FastTrack for an accepted owned Care Request' }) createCare(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto) { return this.fasttrack.createForCareRequest(req.user, p.reference); }
  @Post('fasttrack-requests/external') createExternal(@Req() req: { user: User }, @Body() dto: CreateExternalFastTrackDto) { return this.fasttrack.createExternal(req.user, dto); }
  @Get('fasttrack-requests') list(@Req() req: { user: User }, @Query() query: FastTrackListQueryDto) { return this.fasttrack.listMine(req.user, query); }
  @Get('fasttrack-requests/:reference') get(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto) { return this.fasttrack.getMine(req.user, p.reference); }
  @Post('fasttrack-requests/:reference/cancel') cancel(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto) { return this.fasttrack.cancelMine(req.user, p.reference); }
  @Post('fasttrack-requests/:reference/funding/initialize') initialize(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto) { return this.payments.initializeFastTrackPayment(p.reference, req.user.id); }
  @Get('fasttrack-requests/:reference/funding') funding(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto) { return this.payments.getFastTrackPaymentStatus(p.reference, req.user.id); }
  @Post('fasttrack-requests/:reference/funding/verify') verify(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto) { return this.payments.verifyFastTrackPayment(p.reference, req.user.id); }
}

@ApiTags('Provider FastTrack') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider/fasttrack-requests')
export class ProviderFastTrackController {
  constructor(private readonly fasttrack: FastTrackService) {}
  @Get() list(@Req() req: { user: User }, @Query() query: FastTrackListQueryDto) { return this.fasttrack.listProvider(req.user, query); }
  @Get(':reference') get(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto) { return this.fasttrack.getProvider(req.user, p.reference); }
  @Post(':reference/verify') verify(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto) { return this.fasttrack.providerVerify(req.user, p.reference); }
  @Post(':reference/reject') reject(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto, @Body() dto: FastTrackReasonDto) { return this.fasttrack.providerReject(req.user, p.reference, dto.reason); }
}

@ApiTags('Admin FastTrack') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERATIONS) @Controller('admin/fasttrack-requests')
export class AdminFastTrackController {
  constructor(private readonly fasttrack: FastTrackService) {}
  @Get() list(@Query() query: AdminFastTrackQueryDto) { return this.fasttrack.adminList(query); }
  @Get(':reference') get(@Param() p: FastTrackReferenceParamsDto) { return this.fasttrack.adminGet(p.reference); }
  @Post(':reference/reject') reject(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto, @Body() dto: FastTrackReasonDto) { return this.fasttrack.adminReject(p.reference, req.user.id, dto.reason); }
  @Post(':reference/cancel') cancel(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto, @Body() dto: FastTrackReasonDto) { return this.fasttrack.adminCancel(p.reference, req.user.id, dto.reason); }
  @Post(':reference/expire') expire(@Req() req: { user: User }, @Param() p: FastTrackReferenceParamsDto, @Body() dto: FastTrackReasonDto) { return this.fasttrack.adminExpire(p.reference, req.user.id, dto.reason); }
}
