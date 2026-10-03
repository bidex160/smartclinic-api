import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsObject, Matches } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CARE_REQUEST_REFERENCE_PATTERN } from '../care-requests/care-request-reference';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { IntakeService } from './intake.service';

export class SubmitIntakeDto {
  @ApiProperty({ example: { complaints: ['FEVER'], who: 'ME', sex: 'FEMALE', age: 'A18_39', days: 'D2_3', 'fever.chills': 'YES' } })
  @IsObject() answers!: Record<string, unknown>;
}

export class AttachIntakeDto {
  @ApiProperty() @Matches(CARE_REQUEST_REFERENCE_PATTERN) careRequestReference!: string;
}

@ApiTags('Before-visit questions')
@Controller('intake')
export class PublicIntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Get('questions')
  @ApiOperation({ summary: 'The question set (ids only; wording is in the app translations)' })
  questions() {
    return this.intake.questions();
  }
}

@ApiTags('Before-visit questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/intakes')
export class MeIntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post()
  @ApiOperation({ summary: 'Answer the questions; returns how soon to get care (never a diagnosis)' })
  submit(@Req() r: { user: User }, @Body() dto: SubmitIntakeDto) {
    if (Object.keys(dto.answers).length > 80) throw new BadRequestException('Too many answers');
    return this.intake.submit(r.user, dto.answers);
  }

  @Get(':id')
  one(@Req() r: { user: User }, @Param('id', ParseUUIDPipe) id: string) {
    return this.intake.mine(r.user, id);
  }

  @Post(':id/attach')
  @ApiOperation({ summary: 'Share the answers with the doctor on a care request' })
  attach(@Req() r: { user: User }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AttachIntakeDto) {
    return this.intake.attach(r.user, id, dto.careRequestReference);
  }
}

@ApiTags('Before-visit questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider')
export class ProviderIntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Get('care-requests/:reference/intake')
  @ApiOperation({ summary: 'The patient’s before-visit answers: summary, red flags, conditions to consider' })
  forRequest(@Req() r: { user: User }, @Param('reference') reference: string) {
    return this.intake.forProviderRequest(r.user, reference);
  }

  @Get('care-appointments/:reference/intake')
  forAppointment(@Req() r: { user: User }, @Param('reference') reference: string) {
    return this.intake.forProviderAppointment(r.user, reference);
  }
}
