import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsTimeZone, Matches } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { NUDGES } from './nudges.content';
import { NudgesService } from './nudges.service';

export class UpdateNudgeSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ example: '08:00' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) localTime?: string;
  @ApiPropertyOptional({ example: 'Africa/Kigali' }) @IsOptional() @IsTimeZone() timezone?: string;
  @ApiPropertyOptional({ enum: Object.keys(NUDGES) }) @IsOptional() @IsIn(Object.keys(NUDGES)) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() whatsapp?: boolean;
}

@ApiTags('My daily reminder')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/nudges')
export class NudgesController {
  constructor(private readonly nudges: NudgesService) {}

  @Get()
  @ApiOperation({ summary: 'My daily reminder: on/off, time, language, WhatsApp' })
  get(@Req() r: { user: User }) {
    return this.nudges.getSettings(r.user);
  }

  @Patch()
  update(@Req() r: { user: User }, @Body() dto: UpdateNudgeSettingsDto) {
    return this.nudges.updateSettings(r.user, dto);
  }
}
