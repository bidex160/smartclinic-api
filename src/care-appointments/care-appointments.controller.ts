import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CareRequestReferenceParamsDto } from '../care-requests/dto/care-request.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CareAppointmentListQueryDto, CareAppointmentReasonDto, CareAppointmentReferenceParamsDto, ScheduleCareAppointmentDto, UpdateCareAppointmentMeetingLinkDto } from './dto/care-appointment.dto';
import { CareAppointmentsService } from './care-appointments.service';

@ApiTags('Provider Care Appointments') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider')
export class ProviderCareAppointmentsController {
  constructor(private readonly appointments: CareAppointmentsService) {}
  @Post('care-requests/:reference/schedule') @ApiOperation({ summary: 'Schedule an accepted owned Care Request' }) schedule(@Req() req: { user: User }, @Param() p: CareRequestReferenceParamsDto, @Body() dto: ScheduleCareAppointmentDto) { return this.appointments.schedule(req.user, p.reference, dto); }
  @Get('care-appointments') list(@Req() req: { user: User }, @Query() query: CareAppointmentListQueryDto) { return this.appointments.listProvider(req.user, query); }
  @Get('care-appointments/:reference') get(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto) { return this.appointments.getProvider(req.user, p.reference); }
  @Put('care-appointments/:reference/meeting-link') @ApiOperation({ summary: 'Set or clear an external HTTPS meeting link for an owned virtual appointment' }) meetingLink(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto, @Body() dto: UpdateCareAppointmentMeetingLinkDto) { return this.appointments.updateMeetingLink(req.user, p.reference, dto.meetingUrl ?? null); }
  @Post('care-appointments/:reference/start') start(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto) { return this.appointments.start(req.user, p.reference); }
  @Post('care-appointments/:reference/complete') complete(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto) { return this.appointments.complete(req.user, p.reference); }
  @Post('care-appointments/:reference/cancel') cancel(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto, @Body() dto: CareAppointmentReasonDto) { return this.appointments.cancelProvider(req.user, p.reference, dto.reason); }
  @Post('care-appointments/:reference/no-show') noShow(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto, @Body() dto: CareAppointmentReasonDto) { return this.appointments.noShow(req.user, p.reference, dto.reason); }
}

@ApiTags('My Care Appointments') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER) @Controller('me/care-appointments')
export class MeCareAppointmentsController {
  constructor(private readonly appointments: CareAppointmentsService) {}
  @Get() list(@Req() req: { user: User }, @Query() query: CareAppointmentListQueryDto) { return this.appointments.listMine(req.user, query); }
  @Get(':reference') get(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto) { return this.appointments.getMine(req.user, p.reference); }
  @Post(':reference/cancel') cancel(@Req() req: { user: User }, @Param() p: CareAppointmentReferenceParamsDto, @Body() dto: CareAppointmentReasonDto) { return this.appointments.cancelMine(req.user, p.reference, dto.reason); }
}
