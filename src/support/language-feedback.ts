import { Body, Controller, Get, HttpException, HttpStatus, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Repository, UpdateDateColumn } from 'typeorm';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RateBudget } from '../companion/companion.controller';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

export const FEEDBACK_LANGUAGES = ['en', 'pcm', 'yo', 'ha', 'ig', 'rw', 'fr', 'sw', 'tw'] as const;
export const FEEDBACK_STATUSES = ['OPEN', 'FIXED', 'DISMISSED'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** "This word reads wrong": what people saw, what they'd say instead, and where. No account needed. */
@Entity('language_feedback')
@Index('IDX_language_feedback_status_language', ['status', 'language'])
export class LanguageFeedback {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 8 }) language!: string;
  @Column({ name: 'shown_text', type: 'varchar', length: 300 }) shownText!: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) suggestion!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) page!: string | null;
  /** Translation keys whose text matched, worked out in the browser, to speed up the fix. */
  @Column({ name: 'catalog_keys', type: 'jsonb', default: () => "'[]'::jsonb" }) catalogKeys!: string[];
  @Column({ type: 'varchar', length: 12, default: 'OPEN' }) status!: FeedbackStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

export class CreateLanguageFeedbackDto {
  @ApiProperty({ enum: FEEDBACK_LANGUAGES }) @IsIn(FEEDBACK_LANGUAGES as unknown as string[]) language!: string;
  @ApiProperty({ maxLength: 300 }) @IsString() @MinLength(1) @MaxLength(300) shownText!: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) suggestion?: string;
  @ApiPropertyOptional({ example: '/me/play' }) @IsOptional() @Matches(/^\/[A-Za-z0-9/_\-]{0,199}$/) page?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(5) @Matches(/^[a-z][A-Za-z0-9_.]{1,119}$/, { each: true }) catalogKeys?: string[];
}

export class LanguageFeedbackQueryDto {
  @ApiPropertyOptional({ enum: FEEDBACK_STATUSES }) @IsOptional() @IsIn(FEEDBACK_STATUSES as unknown as string[]) status?: FeedbackStatus;
  @ApiPropertyOptional({ enum: FEEDBACK_LANGUAGES }) @IsOptional() @IsIn(FEEDBACK_LANGUAGES as unknown as string[]) language?: string;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class UpdateLanguageFeedbackDto {
  @ApiProperty({ enum: FEEDBACK_STATUSES }) @IsIn(FEEDBACK_STATUSES as unknown as string[]) status!: FeedbackStatus;
}

/** Strip anything that looks like an email or phone number: people sometimes paste personal details. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class LanguageFeedbackService {
  constructor(@InjectRepository(LanguageFeedback) private readonly rows: Repository<LanguageFeedback>) {}

  async create(dto: CreateLanguageFeedbackDto) {
    const row = await this.rows.save(this.rows.create({
      language: dto.language,
      shownText: scrub(dto.shownText).slice(0, 300),
      suggestion: dto.suggestion?.trim() ? scrub(dto.suggestion).slice(0, 300) : null,
      page: dto.page ?? null,
      catalogKeys: [...new Set(dto.catalogKeys ?? [])].slice(0, 5),
      status: 'OPEN',
    }));
    return { id: row.id, received: true };
  }

  async list(q: LanguageFeedbackQueryDto) {
    const items = await this.rows.find({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.language ? { language: q.language } : {}) },
      order: { createdAt: 'DESC' },
      take: q.limit ?? 100,
    });
    const open = await this.rows.createQueryBuilder('f').select('f.language', 'language').addSelect('COUNT(*)', 'count').where("f.status = 'OPEN'").groupBy('f.language').getRawMany<{ language: string; count: string }>();
    return { items, openByLanguage: Object.fromEntries(open.map((o) => [o.language, Number(o.count)])) };
  }

  async update(id: string, status: FeedbackStatus) {
    const row = await this.rows.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Feedback not found');
    row.status = status;
    return this.rows.save(row);
  }
}

@ApiTags('Language feedback')
@Controller('public/language-feedback')
export class PublicLanguageFeedbackController {
  private readonly budget = new RateBudget(10, 10 * 60_000);
  constructor(private readonly feedback: LanguageFeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Report a word or sentence that reads wrong in your language' })
  create(@Body() dto: CreateLanguageFeedbackDto, @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    if (!this.budget.take(forwarded || req.ip || 'unknown')) throw new HttpException('Thank you — please wait a few minutes before sending more', HttpStatus.TOO_MANY_REQUESTS);
    return this.feedback.create(dto);
  }
}

@ApiTags('Language feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin/language-feedback')
export class AdminLanguageFeedbackController {
  constructor(private readonly feedback: LanguageFeedbackService) {}

  @Get()
  list(@Query() q: LanguageFeedbackQueryDto) {
    return this.feedback.list(q);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLanguageFeedbackDto, @Req() _r: { user: User }) {
    return this.feedback.update(id, dto.status);
  }
}
