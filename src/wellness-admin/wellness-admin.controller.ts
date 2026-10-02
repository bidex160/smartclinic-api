import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RewardBookingRedemptionStatus } from '../rewards/enums/reward-booking-redemption-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { MAX_ADJUSTMENT, WellnessAdminService } from './wellness-admin.service';

export class WellnessRedemptionQueryDto {
  @ApiPropertyOptional({ enum: RewardBookingRedemptionStatus }) @IsOptional() @IsEnum(RewardBookingRedemptionStatus) status?: RewardBookingRedemptionStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class WellnessAdjustmentDto {
  @ApiProperty({ example: 100, description: 'Positive adds points, negative removes them' }) @Type(() => Number) @IsInt() @Min(-MAX_ADJUSTMENT) @Max(MAX_ADJUSTMENT) points!: number;
  @ApiProperty({ example: 'Goodwill after a missed home visit' }) @IsString() @MinLength(5) @MaxLength(300) reason!: string;
}

export class WellnessSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paused?: boolean;
  @ApiPropertyOptional({ minimum: 0, maximum: 50 }) @IsOptional() @IsInt() @Min(0) @Max(50) maxPercent?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 10000 }) @IsOptional() @IsInt() @Min(1) @Max(10000) minPoints?: number;
  @ApiPropertyOptional({ example: { NGN: '5.00', GHS: '0.04', RWF: '4.00' } }) @IsOptional() @IsObject() valuePerPoint?: Record<string, string>;
}

const PATIENT_REF = /^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

@ApiTags('Admin wellness points')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/wellness-points')
export class WellnessAdminController {
  constructor(private readonly admin: WellnessAdminService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Settings and how wellness points are being used' })
  summary() {
    return this.admin.summary();
  }

  @Get('redemptions')
  @ApiOperation({ summary: 'Health Checks paid partly with wellness points, newest first' })
  list(@Query() q: WellnessRedemptionQueryDto) {
    return this.admin.list(q);
  }

  @Get('patients/:patientReference')
  @ApiOperation({ summary: 'One patient’s points, adjustments and redemptions' })
  patient(@Param('patientReference') ref: string) {
    this.checkRef(ref);
    return this.admin.patient(ref);
  }

  @Post('patients/:patientReference/adjustments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add or remove points with a reason (admins only)' })
  adjust(@Param('patientReference') ref: string, @Body() dto: WellnessAdjustmentDto, @Req() req: { user: User }) {
    this.checkRef(ref);
    return this.admin.adjust(ref, dto.points, dto.reason, req.user);
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Pause points, or change the value, cap or minimum (admins only)' })
  settings(@Body() dto: WellnessSettingsDto, @Req() req: { user: User }) {
    return this.admin.updateSettings(dto, req.user);
  }

  private checkRef(ref: string): void {
    if (!PATIENT_REF.test(ref)) throw new BadRequestException('Enter a SmartClinic ID like SCP-AB12-CD34');
  }
}
