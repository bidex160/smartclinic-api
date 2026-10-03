import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';

import { safeTimezone } from '../family/family-kids.service';
import { NudgeSettings } from '../family/kids.entities';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { localDateIn } from '../patients/patient-daily-routine-completions.service';
import { User } from '../users/entities/user.entity';
import { PlayActivityService } from './activity.service';
import { addDays, datesBetween, publicName, standings, THEME_RULES, weekStart } from './challenge-scoring';
import { fill, playText } from './i18n';
import { ChallengeMode, ChallengeTheme, HealthChallenge, HealthChallengeParticipant } from './play.entities';

export const CHALLENGE_DAYS = [3, 7, 14, 30] as const;
export const MAX_PARTICIPANTS: Record<ChallengeMode, number> = { [ChallengeMode.DUEL]: 2, [ChallengeMode.GROUP]: 30 };
/** Most challenges one person can have running that they started. */
export const MAX_OPEN_CREATED = 5;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RESULTS_INTERVAL_MS = 15 * 60_000;

export interface CreateChallengeInput {
  theme: ChallengeTheme;
  mode: ChallengeMode;
  days: number;
  startsOn?: 'today' | 'tomorrow';
  timezone?: string;
}

type Status = 'upcoming' | 'live' | 'ended';

function newCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/**
 * Friendly contests on healthy actions. Boards show first name and initial, a score and active days —
 * nothing about anyone's health. Only people in a challenge can see its board.
 */
@Injectable()
export class ChallengesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengesService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly activity: PlayActivityService,
    @InjectRepository(HealthChallenge) private readonly challenges: Repository<HealthChallenge>,
    @InjectRepository(HealthChallengeParticipant) private readonly participants: Repository<HealthChallengeParticipant>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(NudgeSettings) private readonly nudgeSettings: Repository<NudgeSettings>,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config?.get('NUDGES_ENABLED') === 'false' || process.env['NODE_ENV'] === 'test') return;
    this.interval = setInterval(() => {
      this.sendResults().catch((e) => this.logger.warn(`Challenge results failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, RESULTS_INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async create(user: User, input: CreateChallengeInput, now = new Date()) {
    if (!Object.values(ChallengeTheme).includes(input.theme)) throw new BadRequestException('Choose a challenge type');
    if (!Object.values(ChallengeMode).includes(input.mode)) throw new BadRequestException('Choose one friend or a group');
    if (!(CHALLENGE_DAYS as readonly number[]).includes(input.days)) throw new BadRequestException('Choose 3, 7, 14 or 30 days');
    const patient = await this.patient(user);
    const timezone = safeTimezone(input.timezone);
    const today = localDateIn(now, timezone);
    const open = await this.challenges.count({ where: { createdByUserId: user.id, endDate: MoreThanOrEqual(today) } });
    if (open >= MAX_OPEN_CREATED) throw new ConflictException(`You can run up to ${MAX_OPEN_CREATED} challenges at once. Finish one first.`);
    const startDate = input.startsOn === 'tomorrow' ? addDays(today, 1) : today;
    const endDate = addDays(startDate, input.days - 1);
    const challenge = await this.dataSource.transaction(async (manager) => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = newCode();
        if (await manager.getRepository(HealthChallenge).exists({ where: { code } })) continue;
        const saved = await manager.getRepository(HealthChallenge).save({
          code, createdByUserId: user.id, theme: input.theme, mode: input.mode, startDate, endDate, timezone,
          maxParticipants: MAX_PARTICIPANTS[input.mode], resultsSentAt: null,
        });
        await manager.getRepository(HealthChallengeParticipant).insert({ challengeId: saved.id, userId: user.id, patientId: patient.id });
        return saved;
      }
      throw new ConflictException('Could not create the challenge. Try again.');
    });
    return this.detail(user, challenge.code, timezone, now);
  }

  /** Challenges I'm in: running, starting soon, or finished in the last 30 days. */
  async mine(user: User, timezone: string | undefined, now = new Date()) {
    const tz = safeTimezone(timezone);
    const today = localDateIn(now, tz);
    const mine = await this.participants.find({ where: { userId: user.id }, select: { challengeId: true } });
    if (!mine.length) return { today, challenges: [] };
    const list = await this.challenges.find({
      where: { id: In(mine.map((m) => m.challengeId)), endDate: MoreThanOrEqual(addDays(today, -30)) },
      order: { endDate: 'DESC' },
      take: 20,
    });
    const out = [];
    for (const c of list) {
      const board = await this.board(c, today);
      const me = board.rows.find((r) => r.userId === user.id);
      out.push({
        ...this.summary(c, today, board.rows.length),
        myRank: me?.rank ?? null,
        myScore: me?.score ?? 0,
        doneToday: me?.doneToday ?? false,
        leader: board.rows[0] ? { name: board.rows[0].name, score: board.rows[0].score, isMe: board.rows[0].userId === user.id } : null,
      });
    }
    const order: Record<Status, number> = { live: 0, upcoming: 1, ended: 2 };
    out.sort((a, b) => order[a.status] - order[b.status]);
    return { today, challenges: out };
  }

  async detail(user: User, code: string, timezone: string | undefined, now = new Date()) {
    const c = await this.byCode(code);
    const today = localDateIn(now, safeTimezone(timezone));
    const board = await this.board(c, today);
    const joined = board.rows.some((r) => r.userId === user.id);
    const status = this.status(c, today);
    const base = { ...this.summary(c, today, board.rows.length), joined, isCreator: c.createdByUserId === user.id, rules: THEME_RULES[c.theme] };
    if (!joined) {
      return { ...base, joinable: status !== 'ended' && board.rows.length < c.maxParticipants, creatorName: await this.creatorName(c), board: null };
    }
    return {
      ...base,
      joinable: false,
      creatorName: await this.creatorName(c),
      board: board.rows.map(({ userId, ...r }) => ({ ...r, isMe: userId === user.id })),
    };
  }

  async join(user: User, code: string, timezone: string | undefined, now = new Date()) {
    const patient = await this.patient(user);
    const c = await this.byCode(code);
    const today = localDateIn(now, safeTimezone(c.timezone));
    if (this.status(c, today) === 'ended') throw new ConflictException('This challenge has finished. Start a new one!');
    let added = false;
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(HealthChallenge).findOne({ where: { id: c.id }, lock: { mode: 'pessimistic_write' } });
      const repo = manager.getRepository(HealthChallengeParticipant);
      if (await repo.exists({ where: { challengeId: c.id, userId: user.id } })) return;
      if ((await repo.count({ where: { challengeId: c.id } })) >= c.maxParticipants) {
        throw new ConflictException(c.mode === ChallengeMode.DUEL ? 'This one-on-one challenge already has two players.' : 'This challenge is full.');
      }
      await repo.insert({ challengeId: c.id, userId: user.id, patientId: patient.id });
      added = true;
    });
    if (added && c.createdByUserId !== user.id) {
      const lang = await this.languageOf(c.createdByUserId);
      const text = playText(lang).messages.challengeJoined;
      const name = publicName(patient.givenName, patient.familyName);
      await this.notify(c.createdByUserId, NotificationType.CHALLENGE_JOINED, { title: fill(text.title, { name }), body: fill(text.body, { name }) }, c.code, `challenge-joined:${c.id}:${user.id}`);
    }
    return this.detail(user, code, timezone, now);
  }

  async leave(user: User, code: string) {
    const c = await this.byCode(code);
    await this.participants.delete({ challengeId: c.id, userId: user.id });
    return { left: true };
  }

  /** What anyone with the link can see before signing in: no scores, no names except the inviter's. */
  async preview(code: string, now = new Date()) {
    const c = await this.byCode(code);
    const today = localDateIn(now, safeTimezone(c.timezone));
    const count = await this.participants.count({ where: { challengeId: c.id } });
    return { ...this.summary(c, today, count), creatorName: await this.creatorName(c), joinable: this.status(c, today) !== 'ended' && count < c.maxParticipants };
  }

  /** This week (Monday to today) for me and everyone I've been in a challenge with, all-round scoring. */
  async friendsWeek(user: User, timezone: string | undefined, now = new Date()) {
    const today = localDateIn(now, safeTimezone(timezone));
    const from = weekStart(today);
    const mine = await this.participants.find({ where: { userId: user.id }, select: { challengeId: true } });
    const people = mine.length
      ? await this.participants.find({ where: { challengeId: In(mine.map((m) => m.challengeId)) }, select: { userId: true, patientId: true } })
      : [];
    const me = await this.patient(user);
    const byUser = new Map<string, string>([[user.id, me.id]]);
    for (const p of people) byUser.set(p.userId, p.patientId);
    const patients = await this.patients.find({ where: { id: In([...byUser.values()]), status: PatientStatus.ACTIVE } });
    const activity = await this.activity.byPatient(patients.map((p) => p.id), from, today);
    const rows = standings(ChallengeTheme.ALL_ROUND, patients.map((p) => ({ key: p.id, days: activity.get(p.id) ?? new Map() })), datesBetween(from, today), today);
    const nameOf = new Map(patients.map((p) => [p.id, publicName(p.givenName, p.familyName)]));
    return {
      weekStart: from,
      weekEnd: addDays(from, 6),
      friends: patients.length - 1,
      board: rows.slice(0, 50).map((r) => ({ name: nameOf.get(r.key) ?? 'Friend', score: r.score, rank: r.rank, daysActive: r.daysActive, doneToday: r.doneToday, isMe: r.key === me.id })),
    };
  }

  /** For the daily nudge: my place in a running challenge with at least one other person. */
  async nudgeFacts(userId: string, today: string): Promise<{ rank: number; total: number; daysLeft: number; code: string } | null> {
    const mine = await this.participants.find({ where: { userId }, select: { challengeId: true } });
    if (!mine.length) return null;
    const live = await this.challenges.find({ where: { id: In(mine.map((m) => m.challengeId)), endDate: MoreThanOrEqual(today) }, order: { endDate: 'ASC' } });
    for (const c of live) {
      if (c.startDate > today) continue;
      const board = await this.board(c, today);
      if (board.rows.length < 2) continue;
      const me = board.rows.find((r) => r.userId === userId);
      if (!me || me.doneToday) continue;
      return { rank: me.rank, total: board.rows.length, daysLeft: datesBetween(today, c.endDate).length, code: c.code };
    }
    return null;
  }

  /** Once a challenge is over, tell everyone where they finished. Runs every 15 minutes; each challenge once. */
  async sendResults(now = new Date()): Promise<number> {
    const due = await this.challenges.find({ where: { resultsSentAt: IsNull(), endDate: MoreThanOrEqual(addDays(localDateIn(now, 'UTC'), -7)) }, take: 200 });
    let sent = 0;
    for (const c of due) {
      const today = localDateIn(now, safeTimezone(c.timezone));
      if (c.endDate >= today) continue;
      const board = await this.board(c, c.endDate);
      if (board.rows.length >= 2) {
        const anyoneScored = board.rows.some((r) => r.score > 0);
        for (const row of board.rows) {
          const t = playText(await this.languageOf(row.userId)).messages;
          const text = !anyoneScored ? t.challengeNoScore : row.rank === 1 ? t.challengeWon : t.challengeResult;
          const params = { rank: row.rank, total: board.rows.length };
          try {
            await this.notify(row.userId, NotificationType.CHALLENGE_RESULT, { title: fill(text.title, params), body: fill(text.body, params) }, c.code, `challenge-result:${c.id}:${row.userId}`);
            sent += 1;
          } catch {
            this.logger.warn('Challenge result for one person failed');
          }
        }
      }
      await this.challenges.update({ id: c.id }, { resultsSentAt: now });
    }
    return sent;
  }

  private async board(c: HealthChallenge, today: string) {
    const people = await this.participants.find({ where: { challengeId: c.id }, order: { joinedAt: 'ASC' } });
    const patients = people.length ? await this.patients.find({ where: { id: In(people.map((p) => p.patientId)) } }) : [];
    const nameOf = new Map(patients.map((p) => [p.id, publicName(p.givenName, p.familyName)]));
    const end = c.endDate < today ? c.endDate : today;
    const dates = c.startDate <= end ? datesBetween(c.startDate, end) : [];
    const activity = dates.length ? await this.activity.byPatient(people.map((p) => p.patientId), c.startDate, end) : new Map();
    const userOf = new Map(people.map((p) => [p.patientId, p.userId]));
    const rows = standings(c.theme, people.map((p) => ({ key: p.patientId, days: activity.get(p.patientId) ?? new Map() })), dates, today);
    return {
      rows: rows.map((r) => ({ userId: userOf.get(r.key)!, name: nameOf.get(r.key) ?? 'Friend', score: r.score, rank: r.rank, daysActive: r.daysActive, doneToday: r.doneToday })),
    };
  }

  private summary(c: HealthChallenge, today: string, participants: number) {
    const status = this.status(c, today);
    return {
      code: c.code,
      theme: c.theme,
      mode: c.mode,
      days: datesBetween(c.startDate, c.endDate).length,
      startDate: c.startDate,
      endDate: c.endDate,
      status,
      daysLeft: status === 'ended' ? 0 : datesBetween(today > c.startDate ? today : c.startDate, c.endDate).length,
      participants,
      maxParticipants: c.maxParticipants,
    };
  }

  private status(c: HealthChallenge, today: string): Status {
    if (today < c.startDate) return 'upcoming';
    return today > c.endDate ? 'ended' : 'live';
  }

  private async byCode(code: string): Promise<HealthChallenge> {
    const clean = String(code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(clean)) throw new NotFoundException('Challenge not found');
    const c = await this.challenges.findOne({ where: { code: clean } });
    if (!c) throw new NotFoundException('Challenge not found');
    return c;
  }

  private async creatorName(c: HealthChallenge): Promise<string> {
    const p = await this.patients.findOne({ where: { userId: c.createdByUserId }, select: { givenName: true, familyName: true } });
    return publicName(p?.givenName, p?.familyName);
  }

  private async languageOf(userId: string): Promise<string> {
    return (await this.nudgeSettings.findOne({ where: { userId }, select: { language: true } }))?.language ?? 'en';
  }

  private async notify(userId: string, type: NotificationType, text: { title: string; body: string }, code: string, idempotencyKey: string) {
    if (!this.notifications) return;
    await this.dataSource.transaction((manager) =>
      this.notifications!.createTransactionalNotification(manager, {
        userId,
        type,
        title: text.title.slice(0, 160),
        message: text.body,
        entityType: NotificationEntityType.WELLNESS,
        entityReference: code,
        metadata: { route: `/me/play/challenges/${code}`, kind: type === NotificationType.CHALLENGE_JOINED ? 'challengeJoined' : 'challengeResult' },
        idempotencyKey,
        email: { enabled: false },
      }),
    );
  }

  private async patient(user: User): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { userId: user.id, status: PatientStatus.ACTIVE } });
    if (!patient) throw new ForbiddenException('Only patients can take part in challenges');
    return patient;
  }
}
