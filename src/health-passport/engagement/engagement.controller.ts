import { Body, Controller, Get, Optional, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsTimeZone, Max, MaxLength, Min } from 'class-validator';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { EngagementService } from './engagement.service';
import { WellnessPointsService } from './wellness-points.service';

export class EngagementQueryDto {
  @ApiPropertyOptional({ example: 'Africa/Lagos' }) @IsOptional() @IsTimeZone() timezone?: string;
}

export class AnswerHealthQuizDto {
  @ApiProperty() @IsString() @MaxLength(60) questionId!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(9) choiceIndex!: number;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsTimeZone() timezone!: string;
}

@ApiTags('My engagement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/engagement')
export class EngagementController {
  constructor(
    private readonly engagement: EngagementService,
    @Optional() private readonly wellness?: WellnessPointsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Points, level, streak, badges, passport completion, today’s quiz and points you can spend' })
  async overview(@Req() r: { user: User }, @Query() q: EngagementQueryDto) {
    return { ...(await this.engagement.overview(r.user, q.timezone ?? 'Africa/Lagos')), ...(await this.spendable(r.user)) };
  }

  @Post('quiz/answers')
  @ApiOperation({ summary: 'Answer today’s health quiz question (once a day)' })
  async answer(@Req() r: { user: User }, @Body() dto: AnswerHealthQuizDto) {
    return { ...(await this.engagement.answerQuiz(r.user, dto)), ...(await this.spendable(r.user)) };
  }

  /** What the points are worth toward a Health Check. Level and badges always use lifetime points. */
  private async spendable(user: User) {
    if (!this.wellness) return {};
    const rules = this.wellness.rules();
    return {
      wallet: await this.wellness.wallet(user.id),
      redeem: { valuePerPointMinor: rules.valuePerPointMinor, maxPercent: rules.maxPercent, minPoints: rules.minPoints },
    };
  }
}
