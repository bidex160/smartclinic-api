import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsTimeZone, Max, MaxLength, Min } from 'class-validator';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { EngagementService } from './engagement.service';

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
  constructor(private readonly engagement: EngagementService) {}

  @Get()
  @ApiOperation({ summary: 'Points, level, streak, badges, passport completion and today’s quiz' })
  overview(@Req() r: { user: User }, @Query() q: EngagementQueryDto) {
    return this.engagement.overview(r.user, q.timezone ?? 'Africa/Lagos');
  }

  @Post('quiz/answers')
  @ApiOperation({ summary: 'Answer today’s health quiz question (once a day)' })
  answer(@Req() r: { user: User }, @Body() dto: AnswerHealthQuizDto) {
    return this.engagement.answerQuiz(r.user, dto);
  }
}
