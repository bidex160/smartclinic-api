import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsTimeZone, MaxLength } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RateBudget } from '../companion/companion.controller';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CHALLENGE_DAYS, ChallengesService } from './challenges.service';
import { HealthWordService } from './health-word.service';
import { PLAY_TEXT } from './i18n';
import { ChallengeMode, ChallengeTheme } from './play.entities';

const LANGUAGES = Object.keys(PLAY_TEXT);

export class PlayQueryDto {
  @ApiPropertyOptional({ example: 'Africa/Lagos' }) @IsOptional() @IsTimeZone() timezone?: string;
  @ApiPropertyOptional({ enum: LANGUAGES }) @IsOptional() @IsIn(LANGUAGES) language?: string;
}

export class HealthWordGuessDto extends PlayQueryDto {
  @ApiProperty({ example: 'HEART' }) @IsString() @MaxLength(12) guess!: string;
}

export class CreateChallengeDto {
  @ApiProperty({ enum: ChallengeTheme }) @IsIn(Object.values(ChallengeTheme)) theme!: ChallengeTheme;
  @ApiProperty({ enum: ChallengeMode }) @IsIn(Object.values(ChallengeMode)) mode!: ChallengeMode;
  @ApiProperty({ enum: CHALLENGE_DAYS }) @Type(() => Number) @IsInt() @IsIn(CHALLENGE_DAYS as unknown as number[]) days!: number;
  @ApiPropertyOptional({ enum: ['today', 'tomorrow'] }) @IsOptional() @IsIn(['today', 'tomorrow']) startsOn?: 'today' | 'tomorrow';
  @ApiPropertyOptional({ example: 'Africa/Lagos' }) @IsOptional() @IsTimeZone() timezone?: string;
}

@ApiTags('Play: Health Word and challenges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/play')
export class PlayController {
  constructor(private readonly word: HealthWordService, private readonly challenges: ChallengesService) {}

  @Get('word')
  @ApiOperation({ summary: 'Today’s Health Word: your guesses so far, and the answer and fact once you finish' })
  today(@Req() r: { user: User }, @Query() q: PlayQueryDto) {
    return this.word.today(r.user, q.timezone, q.language ?? 'en');
  }

  @Post('word/start')
  @ApiOperation({ summary: 'Start today’s Health Word (starts the timer)' })
  start(@Req() r: { user: User }, @Body() q: PlayQueryDto) {
    return this.word.start(r.user, q.timezone, q.language ?? 'en');
  }

  @Post('word/guesses')
  @ApiOperation({ summary: 'Make a guess. Six tries a day.' })
  guess(@Req() r: { user: User }, @Body() dto: HealthWordGuessDto) {
    return this.word.guess(r.user, dto);
  }

  @Get('challenges')
  @ApiOperation({ summary: 'Challenges I’m in' })
  mine(@Req() r: { user: User }, @Query() q: PlayQueryDto) {
    return this.challenges.mine(r.user, q.timezone);
  }

  @Post('challenges')
  @ApiOperation({ summary: 'Start a challenge and get an invite link' })
  create(@Req() r: { user: User }, @Body() dto: CreateChallengeDto) {
    return this.challenges.create(r.user, dto);
  }

  @Get('challenges/:code')
  @ApiOperation({ summary: 'A challenge and, if you are in it, its board' })
  detail(@Req() r: { user: User }, @Param('code') code: string, @Query() q: PlayQueryDto) {
    return this.challenges.detail(r.user, code, q.timezone);
  }

  @Post('challenges/:code/join')
  join(@Req() r: { user: User }, @Param('code') code: string, @Body() q: PlayQueryDto) {
    return this.challenges.join(r.user, code, q.timezone);
  }

  @Delete('challenges/:code/participation')
  leave(@Req() r: { user: User }, @Param('code') code: string) {
    return this.challenges.leave(r.user, code);
  }

  @Get('friends/week')
  @ApiOperation({ summary: 'This week’s board: you and everyone you’ve been in a challenge with' })
  friendsWeek(@Req() r: { user: User }, @Query() q: PlayQueryDto) {
    return this.challenges.friendsWeek(r.user, q.timezone);
  }
}

@ApiTags('Play: Health Word and challenges')
@Controller('public/play')
export class PublicPlayController {
  private readonly budget = new RateBudget(60, 10 * 60_000);
  constructor(private readonly challenges: ChallengesService) {}

  @Get('challenges/:code')
  @ApiOperation({ summary: 'Invite preview: who invited you and what the challenge is. No scores.' })
  preview(@Param('code') code: string, @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    if (!this.budget.take(forwarded || req.ip || 'unknown')) throw new HttpException('Please wait a few minutes and try again', HttpStatus.TOO_MANY_REQUESTS);
    return this.challenges.preview(code);
  }
}
