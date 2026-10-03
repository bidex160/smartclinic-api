import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { DoctorCompanionService } from './doctor-companion.service';

export class AssistDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) appointmentReference?: string;
  @ApiPropertyOptional({ description: 'What was said (dictation or transcript)' }) @IsOptional() @IsString() @MaxLength(20000) transcript?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) presentingComplaint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) historyOfPresentingComplaint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) observations?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) assessment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) diagnosis?: string;
}

export class TranscribeQueryDto {
  @ApiPropertyOptional({ example: 'en' }) @IsOptional() @Matches(/^[a-z]{2}$/) language?: string;
}

@ApiTags('Doctor companion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/companion')
export class DoctorCompanionController {
  constructor(private readonly companion: DoctorCompanionService) {}

  @Get('capabilities')
  capabilities() {
    return this.companion.capabilities();
  }

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Turn a recorded consultation into text. Audio is not stored.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['audio'], properties: { audio: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  transcribe(@Req() r: { user: User }, @UploadedFile() audio: { buffer: Buffer; mimetype: string; size: number } | undefined, @Query() q: TranscribeQueryDto) {
    return this.companion.transcribe(r.user, audio, q.language);
  }

  @Post('assist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Structured note, differentials, red flags and suggested orders. Suggestions only; the clinician decides.' })
  assist(@Req() r: { user: User }, @Body() dto: AssistDto) {
    return this.companion.assist(r.user, dto);
  }

  @Get('context')
  @ApiOperation({ summary: 'What to know before starting: age, allergies, home readings, past visits here, the patient’s answers' })
  async context(@Req() r: { user: User }, @Query('appointmentReference') reference: string) {
    return this.companion.contextFor(r.user, reference);
  }
}
