import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RateBudget } from '../companion/companion.controller';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CheckupsService } from './checkups.service';
import { FreeChecksService, GiftRelationship, RELATIONSHIPS } from './free-checks.service';

export class BpDto {
  @ApiProperty({ example: 128 }) @Type(() => Number) @IsInt() @Min(40) @Max(300) systolic!: number;
  @ApiProperty({ example: 82 }) @Type(() => Number) @IsInt() @Min(20) @Max(200) diastolic!: number;
}

export class GlucoseDto {
  @ApiProperty({ example: 5.4 }) @Type(() => Number) @IsNumber() @Min(0.5) @Max(800) value!: number;
  @ApiProperty({ enum: ['mmol/L', 'mg/dL'] }) @IsIn(['mmol/L', 'mg/dL']) unit!: 'mmol/L' | 'mg/dL';
  @ApiProperty({ enum: ['FASTING', 'RANDOM', 'AFTER_MEAL'] }) @IsIn(['FASTING', 'RANDOM', 'AFTER_MEAL']) context!: 'FASTING' | 'RANDOM' | 'AFTER_MEAL';
}

export class ReadingDto {
  @ApiPropertyOptional({ type: [BpDto], description: 'One to three readings, a minute apart' })
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => BpDto) bloodPressure?: BpDto[];
  @ApiPropertyOptional({ example: 72 }) @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(250) pulse?: number;
  @ApiPropertyOptional({ type: GlucoseDto }) @IsOptional() @ValidateNested() @Type(() => GlucoseDto) glucose?: GlucoseDto;
  @ApiPropertyOptional({ example: 78.5 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(10) @Max(400) weightKg?: number;
  @ApiPropertyOptional({ example: 172 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(50) @Max(250) heightCm?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() measuredAt?: string;
}

export class RedeemDto extends ReadingDto {
  @ApiPropertyOptional({ description: 'For a gift: the person agreed to share their results with whoever sent it' }) @IsOptional() @IsBoolean() shareWithGifter?: boolean;
}

export class GiftDto {
  @ApiProperty({ example: 'Mama Funke' }) @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ enum: RELATIONSHIPS }) @IsIn(RELATIONSHIPS as unknown as string[]) relationship!: GiftRelationship;
  @ApiPropertyOptional({ example: '0803 123 4567' }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @ApiPropertyOptional({ description: 'A family member you manage in SmartClinic' }) @IsOptional() @IsUUID() familyPatientId?: string;
}

export class PartnersQueryDto {
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @ApiPropertyOptional({ example: 'Lagos' }) @IsOptional() @IsString() @MaxLength(120) stateOrRegion?: string;
  @ApiPropertyOptional({ example: 'Ikeja' }) @IsOptional() @IsString() @MaxLength(120) city?: string;
}

export class PartnerDto {
  @ApiProperty() @IsBoolean() active!: boolean;
  @ApiPropertyOptional({ description: '0 = no weekly limit' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) weeklyCapacity?: number;
}

export class PublicResultDto {
  @ApiProperty({ example: 'KN7F4Q9P' }) @IsString() @MaxLength(20) code!: string;
  @ApiProperty({ example: '0803 123 4567' }) @IsString() @MaxLength(30) phone!: string;
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
}

type PublicReq = { headers: Record<string, string | string[] | undefined>; ip?: string };
const clientKey = (req: PublicReq) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() || req.ip || 'unknown';

@ApiTags('Check-ups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/checkup')
export class MeCheckupController {
  constructor(private readonly checkups: CheckupsService, private readonly free: FreeChecksService) {}

  @Get()
  @ApiOperation({ summary: 'My check-up plan: latest numbers, what they mean, the next step and its price' })
  view(@Req() r: { user: User }) {
    return this.checkups.view(r.user);
  }

  @Post('readings')
  @ApiOperation({ summary: 'Add numbers taken at home (blood pressure, pulse, sugar, weight, height)' })
  add(@Req() r: { user: User }, @Body() dto: ReadingDto) {
    return this.checkups.addHomeReading(r.user, dto);
  }

  @Get('free-check')
  @ApiOperation({ summary: 'My free check: whether I can get one, and my code' })
  free_(@Req() r: { user: User }) {
    return this.free.mine(r.user);
  }

  @Post('free-check')
  @ApiOperation({ summary: 'Get my free check code (valid 7 days at a partner pharmacy)' })
  issue(@Req() r: { user: User }) {
    return this.free.issueMine(r.user);
  }

  @Get('partners')
  @ApiOperation({ summary: 'Pharmacies and clinics that do free checks, nearest first' })
  partners(@Query() q: PartnersQueryDto) {
    return this.free.partnersNear(q.countryCode ?? 'NG', q.stateOrRegion, q.city);
  }

  @Get('gifts')
  @ApiOperation({ summary: 'Free checks I’ve sent to my parents and family' })
  gifts(@Req() r: { user: User }) {
    return this.free.myGifts(r.user);
  }

  @Post('gifts')
  @ApiOperation({ summary: 'Check Mum and Dad: send a free check to a parent' })
  gift(@Req() r: { user: User }, @Body() dto: GiftDto) {
    return this.free.gift(r.user, dto);
  }

  @Delete('gifts/:id')
  cancel(@Req() r: { user: User }, @Param('id', ParseUUIDPipe) id: string) {
    return this.free.cancelGift(r.user, id);
  }
}

@ApiTags('Check-ups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/free-checks')
export class ProviderFreeChecksController {
  private readonly lookups = new RateBudget(120, 60 * 60_000);
  constructor(private readonly free: FreeChecksService) {}

  @Get()
  @ApiOperation({ summary: 'Are we a free-check partner, how many this week, and the fee per check' })
  status(@Req() r: { user: User }) {
    return this.free.partnerStatus(r.user);
  }

  @Put()
  @ApiOperation({ summary: 'Turn free checks on or off, and set a weekly limit' })
  set(@Req() r: { user: User }, @Body() dto: PartnerDto) {
    return this.free.setPartner(r.user, dto);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Look up a free-check code at the counter' })
  lookup(@Req() r: { user: User }, @Param('code') code: string) {
    if (!this.lookups.take(r.user.id)) throw new HttpException('Too many lookups. Please wait a little.', HttpStatus.TOO_MANY_REQUESTS);
    return this.free.lookup(r.user, code);
  }

  @Post(':code')
  @ApiOperation({ summary: 'Enter the numbers for a free check' })
  redeem(@Req() r: { user: User }, @Param('code') code: string, @Body() dto: RedeemDto) {
    return this.free.redeem(r.user, code, dto);
  }
}

@ApiTags('Check-ups')
@Controller('public/free-checks')
export class PublicFreeChecksController {
  private readonly budget = new RateBudget(10, 10 * 60_000);
  constructor(private readonly free: FreeChecksService) {}

  @Post('result')
  @ApiOperation({ summary: 'See your own free-check result with your code and phone number (no account needed)' })
  result(@Body() dto: PublicResultDto, @Req() req: PublicReq) {
    if (!this.budget.take(clientKey(req))) throw new HttpException('Please wait a few minutes and try again', HttpStatus.TOO_MANY_REQUESTS);
    return this.free.publicResult(dto.code, dto.phone, dto.countryCode ?? 'NG');
  }

  @Get('partners')
  @ApiOperation({ summary: 'Pharmacies and clinics that do free checks, nearest first' })
  partners(@Query() q: PartnersQueryDto, @Req() req: PublicReq) {
    if (!this.budget.take(`p:${clientKey(req)}`)) throw new HttpException('Please wait a few minutes and try again', HttpStatus.TOO_MANY_REQUESTS);
    return this.free.partnersNear(q.countryCode ?? 'NG', q.stateOrRegion, q.city);
  }
}

@ApiTags('Check-ups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/checkups')
export class AdminCheckupsController {
  constructor(private readonly free: FreeChecksService) {}

  @Get()
  @ApiOperation({ summary: 'Free checks this week, gifts, partner pharmacies, fees owed, and where people are in their plans' })
  summary() {
    return this.free.adminSummary();
  }
}
