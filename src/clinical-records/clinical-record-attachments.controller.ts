import { Controller, Delete, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ClinicalRecordAttachmentsService, UploadedClinicalFile } from './clinical-record-attachments.service';
import { ClinicalRecordAttachmentParamsDto, ClinicalRecordAttachmentUploadParamsDto } from './dto/clinical-record-attachment.dto';

@ApiTags('Provider Clinical Record Attachments') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.PROVIDER)
@Controller('provider/clinical-records/:recordReference/attachments')
export class ProviderClinicalRecordAttachmentsController {
  constructor(private readonly attachments: ClinicalRecordAttachmentsService) {}
  @Post() @ApiOperation({ summary: 'Upload a private attachment to an owned draft Clinical Record' }) @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  upload(@Req() req: { user: User }, @Param() params: ClinicalRecordAttachmentUploadParamsDto, @UploadedFile() file?: UploadedClinicalFile) { return this.attachments.upload(req.user, params.recordReference, file); }
  @Delete(':attachmentReference') delete(@Req() req: { user: User }, @Param() params: ClinicalRecordAttachmentParamsDto) { return this.attachments.delete(req.user, params.recordReference, params.attachmentReference); }
  @Get(':attachmentReference/access') access(@Req() req: { user: User }, @Param() params: ClinicalRecordAttachmentParamsDto) { return this.attachments.providerAccess(req.user, params.recordReference, params.attachmentReference); }
}

@ApiTags('My Clinical Record Attachments') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.USER)
@Controller('me/clinical-records/:recordReference/attachments')
export class MeClinicalRecordAttachmentsController {
  constructor(private readonly attachments: ClinicalRecordAttachmentsService) {}
  @Get(':attachmentReference/access') access(@Req() req: { user: User }, @Param() params: ClinicalRecordAttachmentParamsDto) { return this.attachments.patientAccess(req.user, params.recordReference, params.attachmentReference); }
}
