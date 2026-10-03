import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RateBudget } from '../companion/companion.controller';
import { PartnerFacilityType } from '../patient-provider-connections/entities/partner-facility-listing.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { FacilityOutreachService, STAGES, type OutreachStage } from './facility-outreach.service';

export class OutreachQueryDto {
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @ApiPropertyOptional({ example: 'Lagos' }) @IsOptional() @IsString() @MaxLength(120) stateOrRegion?: string;
  @ApiPropertyOptional({ example: 'Ikeja' }) @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional({ enum: PartnerFacilityType }) @IsOptional() @IsEnum(PartnerFacilityType) facilityType?: PartnerFacilityType;
  @ApiPropertyOptional({ enum: STAGES }) @IsOptional() @IsIn(STAGES as unknown as string[]) stage?: OutreachStage;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ContactsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) whatsapp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(254) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) contactName?: string;
}

export class ImportDto {
  @ApiProperty({ description: 'CSV text. Columns: name, type, country, state, city, address, phone, whatsapp, email, website, contact_name' })
  @IsString() @MaxLength(5_000_000) csv!: string;
  @ApiPropertyOptional({ example: 'NG', description: 'Used when a row has no country' }) @IsOptional() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @ApiPropertyOptional({ enum: PartnerFacilityType, description: 'Used when a row has no type' }) @IsOptional() @IsEnum(PartnerFacilityType) facilityType?: PartnerFacilityType;
}

export class InviteDto {
  @ApiPropertyOptional({ type: [String], enum: ['EMAIL', 'WHATSAPP'] }) @IsOptional() @IsArray() @ArrayMaxSize(2) @IsIn(['EMAIL', 'WHATSAPP'], { each: true }) channels?: ('EMAIL' | 'WHATSAPP')[];
}

export class ManualSentDto {
  @ApiProperty({ enum: ['WHATSAPP', 'SMS'] }) @IsIn(['WHATSAPP', 'SMS']) channel!: 'WHATSAPP' | 'SMS';
}

export class ClaimLinkDto {
  @ApiPropertyOptional({ description: 'Make a new link; the old one stops working' }) @IsOptional() @IsBoolean() reset?: boolean;
}

export class ContactLogDto {
  @ApiProperty({ enum: ['CALL', 'VISIT', 'NOTE'] }) @IsIn(['CALL', 'VISIT', 'NOTE']) kind!: 'CALL' | 'VISIT' | 'NOTE';
  @ApiPropertyOptional({ enum: ['INTERESTED', 'CALL_BACK', 'NO_ANSWER', 'DECLINED', 'WRONG_CONTACT'] }) @IsOptional() @IsIn(['INTERESTED', 'CALL_BACK', 'NO_ANSWER', 'DECLINED', 'WRONG_CONTACT'])
  outcome?: 'INTERESTED' | 'CALL_BACK' | 'NO_ANSWER' | 'DECLINED' | 'WRONG_CONTACT';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@ApiTags('Facility outreach')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/facility-outreach')
export class AdminFacilityOutreachController {
  constructor(private readonly outreach: FacilityOutreachService) {}

  @Get()
  @ApiOperation({ summary: 'Stage counts by place, and the call list ranked by patient demand' })
  dashboard(@Query() q: OutreachQueryDto) {
    return this.outreach.dashboard(q);
  }

  @Post('import')
  @ApiOperation({ summary: 'Add or update facilities from a spreadsheet (CSV)' })
  import(@Req() r: { user: User }, @Body() dto: ImportDto) {
    return this.outreach.importCsv(dto.csv, r.user, { countryCode: dto.countryCode?.toUpperCase(), facilityType: dto.facilityType });
  }

  @Get(':listingId/history')
  history(@Param('listingId', ParseUUIDPipe) id: string) {
    return this.outreach.history(id);
  }

  @Patch(':listingId/contacts')
  contacts(@Req() r: { user: User }, @Param('listingId', ParseUUIDPipe) id: string, @Body() dto: ContactsDto) {
    return this.outreach.updateContacts(id, dto, r.user);
  }

  @Post(':listingId/claim-link')
  @ApiOperation({ summary: 'The facility’s claim link (the same link until reset)' })
  claimLink(@Param('listingId', ParseUUIDPipe) id: string, @Body() dto: ClaimLinkDto) {
    return this.outreach.claimLink(id, { reset: dto.reset });
  }

  @Post(':listingId/invite')
  @ApiOperation({ summary: 'Send the invite by email (and WhatsApp once the template is approved); returns WhatsApp and SMS links to send by hand' })
  invite(@Req() r: { user: User }, @Param('listingId', ParseUUIDPipe) id: string, @Body() dto: InviteDto) {
    return this.outreach.invite(id, r.user, dto.channels);
  }

  @Post(':listingId/manual-sent')
  manualSent(@Req() r: { user: User }, @Param('listingId', ParseUUIDPipe) id: string, @Body() dto: ManualSentDto) {
    return this.outreach.markSentManually(id, r.user, dto.channel);
  }

  @Post(':listingId/contact-log')
  @ApiOperation({ summary: 'Record a call or visit and how it went' })
  contactLog(@Req() r: { user: User }, @Param('listingId', ParseUUIDPipe) id: string, @Body() dto: ContactLogDto) {
    return this.outreach.logContact(id, r.user, dto);
  }
}

@ApiTags('Facility outreach')
@Controller('public/facility-claims')
export class PublicFacilityClaimController {
  private readonly budget = new RateBudget(30, 10 * 60_000);
  constructor(private readonly outreach: FacilityOutreachService) {}

  @Get(':token')
  @ApiOperation({ summary: 'What a claim link is for: the facility’s name, place, and how many patients asked for it' })
  preview(@Param('token') token: string, @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    if (!this.budget.take(forwarded || req.ip || 'unknown')) throw new HttpException('Please wait a few minutes and try again', HttpStatus.TOO_MANY_REQUESTS);
    return this.outreach.preview(token);
  }
}
