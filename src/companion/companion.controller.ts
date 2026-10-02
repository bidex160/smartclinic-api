import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';

import { COMPANION_CHARACTERS, COMPANION_LANGUAGES, COMPANION_TOPICS, CompanionCharacter, CompanionLanguage } from './companion.languages';
import { CompanionService } from './companion.service';

export class CompanionAskDto {
  @ApiProperty({ enum: COMPANION_LANGUAGES }) @IsIn(COMPANION_LANGUAGES as unknown as string[]) language!: CompanionLanguage;
  @ApiProperty({ enum: COMPANION_CHARACTERS }) @IsIn(COMPANION_CHARACTERS as unknown as string[]) character!: CompanionCharacter;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) question?: string;
  @ApiPropertyOptional({ enum: Object.keys(COMPANION_TOPICS) }) @IsOptional() @IsIn(Object.keys(COMPANION_TOPICS)) topic?: string;
  @ApiPropertyOptional({ example: '/me/dashboard' }) @IsOptional() @IsString() @MaxLength(100) @Matches(/^\/[A-Za-z0-9/_-]*$/) page?: string;
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @IsIn(['NG', 'GH', 'RW']) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() signedIn?: boolean;
}

export class CompanionSpeakDto {
  @ApiProperty({ maxLength: 700 }) @IsString() @MinLength(1) @MaxLength(700) text!: string;
  @ApiProperty({ enum: COMPANION_LANGUAGES }) @IsIn(COMPANION_LANGUAGES as unknown as string[]) language!: CompanionLanguage;
  @ApiProperty({ enum: COMPANION_CHARACTERS }) @IsIn(COMPANION_CHARACTERS as unknown as string[]) character!: CompanionCharacter;
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @IsIn(['NG', 'GH', 'RW']) country?: string;
}

/** A simple per-address budget so a public endpoint can't run up the voice bill. */
export class RateBudget {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.delete(this.hits.keys().next().value!);
    return true;
  }
}

/**
 * The in-app companion. Public, because it helps people before they sign in too.
 * Nothing people say or hear is stored.
 */
@ApiTags('Companion')
@Controller('public/companion')
export class CompanionController {
  private readonly askBudget = new RateBudget(30, 10 * 60_000);
  private readonly speakBudget = new RateBudget(60, 10 * 60_000);

  constructor(private readonly companion: CompanionService) {}

  @Get('capabilities')
  @ApiOperation({ summary: 'Which languages have a natural voice, and whether smart answers are on' })
  capabilities() {
    return this.companion.capabilities();
  }

  @Post('answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer a question, or explain a topic, in the chosen language' })
  answer(@Req() req: Request, @Body() dto: CompanionAskDto) {
    if (!dto.question?.trim() && !dto.topic) throw new HttpException('Ask a question or choose a topic', HttpStatus.BAD_REQUEST);
    this.guard(this.askBudget, req);
    return this.companion.answer(dto);
  }

  @Post('speech')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read text aloud in a natural voice (audio bytes)' })
  async speech(@Req() req: Request, @Body() dto: CompanionSpeakDto, @Res() res: Response) {
    this.guard(this.speakBudget, req);
    const audio = await this.companion.speak(dto);
    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(audio.audio);
  }

  private guard(budget: RateBudget, req: Request): void {
    // Behind the hosting proxy every request shares one address, so key on the original client.
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    if (!budget.take(forwarded || req.ip || 'unknown')) throw new HttpException('Please wait a few minutes and try again', HttpStatus.TOO_MANY_REQUESTS);
  }
}
