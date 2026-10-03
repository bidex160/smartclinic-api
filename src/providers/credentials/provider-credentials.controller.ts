import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UploadedPrivateFile } from '../../common/storage/private-attachment-file';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { ProviderType } from '../enums/provider-type.enum';
import { ProviderCredentialsService } from './provider-credentials.service';

export class SetSpecialtiesDto {
  @ApiProperty({ type: [String], example: ['GENERAL_PRACTICE'] }) @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @Matches(/^[A-Z][A-Z0-9_]{1,79}$/, { each: true }) codes!: string[];
  @ApiPropertyOptional({ example: 'GENERAL_PRACTICE' }) @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) primary?: string;
}

export class SetCredentialDto {
  @ApiProperty({ example: 'MDCN' }) @IsString() @MaxLength(20) regulator!: string;
  @ApiProperty({ example: 'MDCN/R/123456' }) @IsString() @MinLength(3) @MaxLength(60) licenceNumber!: string;
}

export class VerifyCredentialDto {
  @ApiProperty({ example: 'MDCN online register' }) @IsString() @MinLength(2) @MaxLength(120) checkedVia!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RejectCredentialDto {
  @ApiProperty({ example: 'The number does not match the name on the register. Please upload your certificate.' }) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class RegulatorQueryDto {
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional({ enum: ProviderType }) @IsOptional() @IsEnum(ProviderType) providerType?: ProviderType;
}

@ApiTags('Specialties and licences')
@Controller('public/provider-directory')
export class PublicSpecialtiesController {
  constructor(private readonly credentials: ProviderCredentialsService) {}

  @Get('specialties')
  @ApiOperation({ summary: 'Medical specialties a doctor can choose, and patients can search by' })
  specialties() {
    return this.credentials.catalogue();
  }

  @Get('regulators')
  @ApiOperation({ summary: 'Who issues licences, for a country and provider type' })
  regulators(@Query() q: RegulatorQueryDto) {
    return this.credentials.regulators(q.countryCode, q.providerType);
  }
}

@ApiTags('Specialties and licences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/credentials')
export class ProviderCredentialsController {
  constructor(private readonly credentials: ProviderCredentialsService) {}

  @Get()
  @ApiOperation({ summary: 'My specialties, my licence and whether it is verified' })
  mine(@Req() r: { user: User }) {
    return this.credentials.mine(r.user);
  }

  @Put('specialties')
  setSpecialties(@Req() r: { user: User }, @Body() dto: SetSpecialtiesDto) {
    return this.credentials.setMySpecialties(r.user, dto.codes, dto.primary);
  }

  @Put('licence')
  setLicence(@Req() r: { user: User }, @Body() dto: SetCredentialDto) {
    return this.credentials.setMyCredential(r.user, dto);
  }

  @Post('licence/document')
  @ApiOperation({ summary: 'Upload a photo or PDF of the licence certificate (seen only by SmartClinic staff)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  upload(@Req() r: { user: User }, @UploadedFile() file?: UploadedPrivateFile) {
    return this.credentials.uploadMyDocument(r.user, file);
  }
}

@ApiTags('Specialties and licences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/providers/:providerId/credentials')
export class AdminProviderCredentialsController {
  constructor(private readonly credentials: ProviderCredentialsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  @ApiOperation({ summary: 'A provider’s specialties and licence, with a short-lived link to the certificate' })
  get(@Param('providerId', ParseUUIDPipe) providerId: string) {
    return this.credentials.adminView(providerId);
  }

  @Post('verify')
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  @ApiOperation({ summary: 'Mark the licence as checked with the regulator' })
  verify(@Req() r: { user: User }, @Param('providerId', ParseUUIDPipe) providerId: string, @Body() dto: VerifyCredentialDto) {
    return this.credentials.verify(providerId, r.user, dto);
  }

  @Post('reject')
  @Roles(UserRole.ADMIN, UserRole.OPERATIONS)
  @ApiOperation({ summary: 'Send the licence back with what to fix' })
  reject(@Req() r: { user: User }, @Param('providerId', ParseUUIDPipe) providerId: string, @Body() dto: RejectCredentialDto) {
    return this.credentials.reject(providerId, r.user, dto.reason);
  }
}
