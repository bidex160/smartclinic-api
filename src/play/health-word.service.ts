import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { safeTimezone } from '../family/family-kids.service';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { localDateIn } from '../patients/patient-daily-routine-completions.service';
import { ReferralsService } from '../rewards/referrals.service';
import { User } from '../users/entities/user.entity';
import { addDays } from './challenge-scoring';
import { HEALTH_WORDS, markGuess, MAX_GUESSES, normaliseGuess, puzzleNumber, WORD_LENGTH, wordFact, wordForDate } from './health-word.content';
import { HealthWordGame } from './play.entities';

/** Same as the daily question: 5 for playing to the end, 5 more for solving. */
export const WORD_POINTS = { played: 5, solved: 5 } as const;

@Injectable()
export class HealthWordService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(HealthWordGame) private readonly games: Repository<HealthWordGame>,
    @Optional() private readonly referrals?: ReferralsService,
  ) {}

  async today(user: User, timezone: string | undefined, language: string, now = new Date()) {
    const patient = await this.patient(user);
    const today = localDateIn(now, safeTimezone(timezone));
    const game = await this.games.findOne({ where: { patientId: patient.id, localDate: today } });
    return this.view(user, patient, today, game, language, now);
  }

  /** Starts the clock. Calling it again changes nothing. */
  async start(user: User, timezone: string | undefined, language: string, now = new Date()) {
    const patient = await this.patient(user);
    const today = localDateIn(now, safeTimezone(timezone));
    const word = wordForDate(today);
    await this.games
      .createQueryBuilder()
      .insert()
      .into(HealthWordGame)
      .values({ patientId: patient.id, localDate: today, puzzleNumber: puzzleNumber(today), wordId: word.id, guesses: [], startedAt: now })
      .orIgnore()
      .execute();
    const game = await this.games.findOne({ where: { patientId: patient.id, localDate: today } });
    return this.view(user, patient, today, game, language, now);
  }

  async guess(user: User, dto: { guess: string; timezone?: string; language?: string }, now = new Date()) {
    const guess = normaliseGuess(dto.guess);
    if (!guess) throw new BadRequestException(`Type a ${WORD_LENGTH}-letter word`);
    const patient = await this.patient(user);
    const today = localDateIn(now, safeTimezone(dto.timezone));
    const word = wordForDate(today);
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(HealthWordGame);
      await repo
        .createQueryBuilder()
        .insert()
        .into(HealthWordGame)
        .values({ patientId: patient.id, localDate: today, puzzleNumber: puzzleNumber(today), wordId: word.id, guesses: [], startedAt: now })
        .orIgnore()
        .execute();
      const game = await repo.findOne({ where: { patientId: patient.id, localDate: today }, lock: { mode: 'pessimistic_write' } });
      if (!game) throw new NotFoundException('Game not found');
      if (game.finished) throw new ConflictException("You've finished today's Health Word. A new one comes tomorrow.");
      const answer = HEALTH_WORDS.find((w) => w.id === game.wordId)?.word ?? word.word;
      const guesses = [...game.guesses, guess];
      const solved = guess === answer;
      const finished = solved || guesses.length >= MAX_GUESSES;
      await repo.update({ id: game.id }, { guesses, solved, finished, finishedAt: finished ? now : null });
    });
    const game = await this.games.findOne({ where: { patientId: patient.id, localDate: today } });
    return this.view(user, patient, today, game, dto.language ?? 'en', now);
  }

  /** Lifetime counts, for points and badges. */
  async counts(patientId: string): Promise<{ played: number; solved: number }> {
    const [played, solved] = await Promise.all([
      this.games.count({ where: { patientId, finished: true } }),
      this.games.count({ where: { patientId, solved: true } }),
    ]);
    return { played, solved };
  }

  private async view(user: User, patient: Patient, today: string, game: HealthWordGame | null, language: string, now: Date) {
    const word = game ? HEALTH_WORDS.find((w) => w.id === game.wordId) ?? wordForDate(today) : wordForDate(today);
    const rows = (game?.guesses ?? []).map((g) => ({ guess: g, marks: markGuess(g, word.word) }));
    const finished = Boolean(game?.finished);
    const seconds = game ? Math.max(0, Math.round(((game.finishedAt ?? now).getTime() - game.startedAt.getTime()) / 1000)) : 0;
    const inviteCode = this.referrals ? (await this.referrals.ensureReferralCode(user.id).catch(() => null))?.codeNormalized ?? null : null;
    return {
      localDate: today,
      puzzleNumber: puzzleNumber(today),
      length: WORD_LENGTH,
      maxGuesses: MAX_GUESSES,
      category: word.category,
      started: Boolean(game),
      startedAt: game?.startedAt ?? null,
      rows,
      finished,
      solved: Boolean(game?.solved),
      seconds,
      answer: finished ? word.word : null,
      fact: finished ? wordFact(language, word.id) : null,
      pointsEarned: finished ? WORD_POINTS.played + (game?.solved ? WORD_POINTS.solved : 0) : 0,
      stats: await this.stats(patient.id, today),
      inviteCode,
    };
  }

  private async stats(patientId: string, today: string) {
    const games = await this.games.find({ where: { patientId, finished: true }, select: { localDate: true, solved: true, guesses: true }, order: { localDate: 'DESC' }, take: 400 });
    const solvedDates = new Set(games.filter((g) => g.solved).map((g) => String(g.localDate).slice(0, 10)));
    let streak = 0;
    let cursor = solvedDates.has(today) ? today : addDays(today, -1);
    while (solvedDates.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    const distribution = Array.from({ length: MAX_GUESSES }, () => 0);
    for (const g of games) if (g.solved && g.guesses.length >= 1 && g.guesses.length <= MAX_GUESSES) distribution[g.guesses.length - 1] += 1;
    return { played: games.length, solved: solvedDates.size, streak, distribution };
  }

  private async patient(user: User): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { userId: user.id, status: PatientStatus.ACTIVE } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }
}
