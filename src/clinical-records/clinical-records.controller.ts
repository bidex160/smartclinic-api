import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ClinicalRecordAppointmentParamsDto, ClinicalRecordListQueryDto, ClinicalRecordReferenceParamsDto, CreateClinicalRecordDto, UpdateClinicalRecordDto } from './dto/clinical-record.dto';
import { ClinicalRecordsService } from './clinical-records.service';

@ApiTags('Provider Clinical Records') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER)
@Controller('provider/care-appointments/:reference/clinical-record')
export class ProviderClinicalRecordsController {
  constructor(private readonly records: ClinicalRecordsService) {}
  @Post() @ApiOperation({ summary: 'Create the draft primary clinical record for an owned appointment' }) create(@Req() req: { user: User }, @Param() p: ClinicalRecordAppointmentParamsDto, @Body() dto: CreateClinicalRecordDto) { return this.records.createForAppointment(req.user, p.reference, dto); }
  @Get() get(@Req() req: { user: User }, @Param() p: ClinicalRecordAppointmentParamsDto) { return this.records.getForProvider(req.user, p.reference); }
  @Patch() update(@Req() req: { user: User }, @Param() p: ClinicalRecordAppointmentParamsDto, @Body() dto: UpdateClinicalRecordDto) { return this.records.updateForAppointment(req.user, p.reference, dto); }
  @Post('finalize') finalize(@Req() req: { user: User }, @Param() p: ClinicalRecordAppointmentParamsDto) { return this.records.finalizeForAppointment(req.user, p.reference); }
}

@ApiTags('My Clinical Records') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER)
@Controller('me/clinical-records')
export class MeClinicalRecordsController {
  constructor(private readonly records: ClinicalRecordsService) {}
  @Get() list(@Req() req: { user: User }, @Query() query: ClinicalRecordListQueryDto) { return this.records.listMine(req.user, query); }
  @Get(':reference') get(@Req() req: { user: User }, @Param() p: ClinicalRecordReferenceParamsDto) { return this.records.getMine(req.user, p.reference); }
}
