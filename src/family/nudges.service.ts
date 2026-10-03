import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';

import { HealthQuizAnswer } from '../health-passport/engagement/health-quiz-answer.entity';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { PatientDailyCheckIn } from '../patients/entities/patient-daily-check-in.entity';
import { PatientDailyRoutineCompletion } from '../patients/entities/patient-daily-routine-completion.entity';
import { PatientHealthBasics } from '../patients/entities/patient-health-basics.entity';
import { PatientRelationship } from '../patients/entities/patient-relationship.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientRelationshipRole, PatientRelationshipStatus } from '../patients/enums/patient-relationship.enum';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { localDateIn, streakEndingAt } from '../patients/patient-daily-routine-completions.service';
import { User } from '../users/entities/user.entity';
import { ChallengesService } from '../play/challenges.service';
import { HealthWordGame } from '../play/play.entities';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from '../whatsapp/adapters/whatsapp-provider.interface';
import { safeTimezone } from './family-kids.service';
import { ageInYears, KIDS_MAX_AGE, nextWellChildVisit } from './kids.content';
import { ChildDailyTask, ChildTaskCompletion, NudgeSettings } from './kids.entities';
import { chooseNudge, NudgeKind, nudgeText, NUDGES } from './nudges.content';

const COUNTRY_TZ: Record<string, string> = { NG: 'Africa/Lagos', GH: 'Africa/Accra', RW: 'Africa/Kigali' };
const DATE_LOCALE: Record<string, string> = { en: 'en-GB', pcm: 'en-GB', yo: 'yo-NG', ha: 'ha-NG', ig: 'ig-NG', rw: 'rw-RW', fr: 'fr-FR', sw: 'sw-KE', tw: 'ak-GH' };
const INTERVAL_MS = 5 * 60_000;
/** Send within this many minutes after the chosen time (covers restarts and slow ticks). */
const WINDOW_MINUTES = 90;
/** Only people who used the app in this many days (or joined recently) get nudges. */
const ACTIVE_WITHIN_DAYS = 60;

export interface NudgeSettingsView {
  enabled: boolean;
  localTime: string;
  timezone: string;
  language: string;
  whatsapp: boolean;
  whatsappAvailable: boolean;
}

/**
 * One gentle nudge a day, at the time the person chose, in their language — and only if it helps:
 * nothing if they've already been active, less often if they keep ignoring it.
 */
@Injectable()
export class NudgesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NudgesService.name);
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    @InjectRepository(NudgeSettings) private readonly settings: Repository<NudgeSettings>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientRelationship) private readonly relationships: Repository<PatientRelationship>,
    @InjectRepository(PatientHealthBasics) private readonly basics: Repository<PatientHealthBasics>,
    @InjectRepository(PatientDailyCheckIn) private readonly checkIns: Repository<PatientDailyCheckIn>,
    @InjectRepository(PatientDailyRoutineCompletion) private readonly ticks: Repository<PatientDailyRoutineCompletion>,
    @InjectRepository(HealthQuizAnswer) private readonly quiz: Repository<HealthQuizAnswer>,
    @InjectRepository(ChildDailyTask) private readonly kidTasks: Repository<ChildDailyTask>,
    @InjectRepository(ChildTaskCompletion) private readonly kidDone: Repository<ChildTaskCompletion>,
    @Optional() private readonly config?: ConfigService,
    @Optional() @Inject(WHATSAPP_PROVIDER) private readonly whatsapp?: WhatsAppProvider,
    @Optional() @InjectRepository(HealthWordGame) private readonly words?: Repository<HealthWordGame>,
    @Optional() private readonly challenges?: ChallengesService,
  ) {}

  onModuleInit(): void {
    if (this.config?.get('NUDGES_ENABLED') === 'false' || process.env['NODE_ENV'] === 'test') return;
    this.interval = setInterval(() => {
      this.dispatchDue().catch((e) => this.logger.warn(`Nudge run failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  whatsappAvailable(): boolean {
    return this.config?.get('WHATSAPP_ENABLED') === 'true' && Boolean(this.config?.get('NUDGE_WHATSAPP_TEMPLATE')) && Boolean(this.whatsapp?.sendTemplate);
  }

  async getSettings(user: User): Promise<NudgeSettingsView> {
    const row = await this.settings.findOne({ where: { userId: user.id } });
    const patient = row ? null : await this.patients.findOne({ where: { userId: user.id, status: PatientStatus.ACTIVE } });
    return {
      enabled: row?.enabled ?? true,
      localTime: row?.localTime ?? '08:00',
      timezone: row?.timezone ?? COUNTRY_TZ[patient?.countryCode ?? ''] ?? 'Africa/Lagos',
      language: row?.language ?? 'en',
      whatsapp: row?.whatsapp ?? false,
      whatsappAvailable: this.whatsappAvailable(),
    };
  }

  async updateSettings(user: User, dto: Partial<Pick<NudgeSettings, 'enabled' | 'localTime' | 'timezone' | 'language' | 'whatsapp'>>): Promise<NudgeSettingsView> {
    if (dto.localTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.localTime)) throw new BadRequestException('Time must look like 08:00');
    if (dto.language !== undefined && !(dto.language in NUDGES)) throw new BadRequestException('Unknown language');
    const current = await this.getSettings(user);
    const existing = await this.settings.findOne({ where: { userId: user.id } });
    await this.settings.save({
      ...(existing ?? {}),
      userId: user.id,
      enabled: dto.enabled ?? current.enabled,
      localTime: dto.localTime ?? current.localTime,
      timezone: dto.timezone ? safeTimezone(dto.timezone) : current.timezone,
      language: dto.language ?? current.language,
      whatsapp: dto.whatsapp ?? current.whatsapp,
      updatedAt: new Date(),
    });
    return this.getSettings(user);
  }

  /** Called every few minutes. Each person is handled at most once a day. */
  async dispatchDue(now = new Date()): Promise<{ sent: number; checked: number }> {
    if (this.running) return { sent: 0, checked: 0 };
    this.running = true;
    let sent = 0;
    let checked = 0;
    try {
      const since = new Date(now.getTime() - ACTIVE_WITHIN_DAYS * 86_400_000);
      const candidates = await this.patients
        .createQueryBuilder('p')
        .leftJoinAndMapOne('p.nudge', NudgeSettings, 'ns', 'ns.userId = p.userId')
        .where('p.userId IS NOT NULL')
        .andWhere('p.status = :active', { active: PatientStatus.ACTIVE })
        .andWhere('(ns.userId IS NULL OR ns.enabled = true)')
        .andWhere(
          `(p.createdAt >= :since
            OR EXISTS (SELECT 1 FROM patient_daily_check_ins c WHERE c.patient_id = p.id AND c.created_at >= :since)
            OR EXISTS (SELECT 1 FROM patient_daily_routine_completions r WHERE r.patient_id = p.id AND r.completed_at >= :since)
            OR EXISTS (SELECT 1 FROM health_quiz_answers q WHERE q.patient_id = p.id AND q.created_at >= :since)
            OR EXISTS (SELECT 1 FROM health_word_games w WHERE w.patient_id = p.id AND w.started_at >= :since))`,
          { since },
        )
        .getMany();
      for (const patient of candidates as (Patient & { nudge?: NudgeSettings | null })[]) {
        const ns = patient.nudge ?? null;
        const tz = safeTimezone(ns?.timezone ?? COUNTRY_TZ[patient.countryCode ?? ''] ?? 'Africa/Lagos');
        const today = localDateIn(now, tz);
        if (ns?.lastSentDate && String(ns.lastSentDate).slice(0, 10) === today) continue;
        if (!this.isDue(now, tz, ns?.localTime ?? '08:00')) continue;
        checked += 1;
        try {
          sent += await this.handle(patient, ns, tz, today, now);
        } catch (e) {
          this.logger.warn(`Nudge for one patient failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`);
        }
      }
      return { sent, checked };
    } finally {
      this.running = false;
    }
  }

  private async handle(patient: Patient, ns: NudgeSettings | null, tz: string, today: string, now: Date): Promise<number> {
    const userId = patient.userId!;
    const language = ns?.language ?? 'en';
    const since = new Date(Date.parse(`${today}T12:00:00Z`) - ACTIVE_WITHIN_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [checkIns, ticks, quiz, basics, words] = await Promise.all([
      this.checkIns.find({ where: { patientId: patient.id, localDate: MoreThanOrEqual(since) }, select: { localDate: true } }),
      this.ticks.find({ where: { patientId: patient.id, localDate: MoreThanOrEqual(since) }, select: { localDate: true } }),
      this.quiz.find({ where: { patientId: patient.id, localDate: MoreThanOrEqual(since) }, select: { localDate: true } }),
      this.basics.findOne({ where: { patientId: patient.id } }),
      this.words?.find({ where: { patientId: patient.id, localDate: MoreThanOrEqual(since), finished: true }, select: { localDate: true } }) ?? Promise.resolve([] as HealthWordGame[]),
    ]);
    const day = (d: string | Date) => String(d instanceof Date ? d.toISOString() : d).slice(0, 10);
    const activeDays = new Set([...checkIns, ...ticks, ...quiz, ...words].map((r) => day(r.localDate)));
    const lastNudged = ns?.lastNudgedDate ? day(ns.lastNudgedDate) : null;
    const respondedSinceLast = lastNudged ? [...activeDays].some((d) => d >= lastNudged) : true;

    // Children: tasks left today, and check-ups due in a week or today.
    const kids = await this.kidsFor(userId, today);
    let sent = 0;
    for (const kid of kids) {
      if (!kid.visit || (kid.visit.daysAway !== 7 && kid.visit.daysAway !== 0)) continue;
      const kind: NudgeKind = kid.visit.daysAway === 0 ? 'visitToday' : 'visitSoon';
      const date = new Intl.DateTimeFormat(DATE_LOCALE[language] ?? 'en-GB', { day: 'numeric', month: 'long' }).format(new Date(`${kid.visit.dueDate}T12:00:00Z`));
      const text = nudgeText(language, kind, { child: kid.name, date });
      await this.send(userId, NotificationType.WELL_CHILD_VISIT, text, `/me/family/kids/${kid.ref}`, kind, `visit:${kid.id}:${kid.visit.key}:${kid.visit.daysAway}`);
      sent += 1;
    }

    const choice = chooseNudge({
      activeToday: activeDays.has(today),
      streak: streakEndingAt(today, activeDays),
      quizAnsweredToday: quiz.some((q) => day(q.localDate) === today),
      wordPlayedToday: words.some((w) => day(w.localDate) === today),
      challenge: this.challenges ? await this.challenges.nudgeFacts(userId, today).catch(() => null) : null,
      passportIncomplete: !basics?.bloodGroup || !basics?.genotype || !basics?.emergencyContactPhone,
      kidsPending: kids.filter((k) => k.total > 0).map((k) => ({ name: k.name, done: k.done, total: k.total, ref: k.ref })),
      ignoredInARow: ns?.ignoredInARow ?? 0,
      dayNumber: Math.floor(Date.parse(`${today}T12:00:00Z`) / 86_400_000),
    });

    const ignoredInARow = choice ? (respondedSinceLast ? 0 : (ns?.ignoredInARow ?? 0) + 1) : activeDays.has(today) ? 0 : ns?.ignoredInARow ?? 0;
    if (choice) {
      const text = nudgeText(language, choice.kind, choice.params);
      await this.send(userId, NotificationType.DAILY_NUDGE, text, choice.route, choice.kind, `nudge:${userId}:${today}`);
      if (ns?.whatsapp && patient.phone) await this.sendWhatsApp(patient.phone, language, text);
      sent += 1;
    }
    await this.settings.save({
      ...(ns ?? { enabled: true, localTime: '08:00', timezone: tz, language: 'en', whatsapp: false }),
      userId,
      lastSentDate: today,
      lastNudgedDate: choice ? today : ns?.lastNudgedDate ?? null,
      ignoredInARow,
      updatedAt: now,
    } as NudgeSettings);
    return sent;
  }

  private async kidsFor(userId: string, today: string) {
    const links = await this.relationships.find({
      where: { relatedUserId: userId, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE },
      select: { patientId: true },
    });
    if (!links.length) return [];
    const children = await this.patients.find({ where: { id: In(links.map((l) => l.patientId)), status: PatientStatus.ACTIVE } });
    const out: { id: string; ref: string; name: string; done: number; total: number; visit: ReturnType<typeof nextWellChildVisit> }[] = [];
    for (const c of children) {
      if (!c.dateOfBirth) continue;
      const age = ageInYears(String(c.dateOfBirth), today);
      if (age > KIDS_MAX_AGE) continue;
      const tasks = await this.kidTasks.find({ where: { childPatientId: c.id, enabled: true }, select: { id: true } });
      const done = tasks.length ? await this.kidDone.count({ where: { childPatientId: c.id, localDate: today, taskId: In(tasks.map((t) => t.id)) } }) : 0;
      out.push({ id: c.id, ref: c.patientReference, name: c.givenName, done, total: tasks.length, visit: age < 6 ? nextWellChildVisit(String(c.dateOfBirth), today) : null });
    }
    return out;
  }

  private async send(userId: string, type: NotificationType, text: { title: string; body: string }, route: string, kind: string, idempotencyKey: string) {
    await this.dataSource.transaction((manager) =>
      this.notifications.createTransactionalNotification(manager, {
        userId,
        type,
        title: text.title.slice(0, 160),
        message: text.body,
        entityType: NotificationEntityType.WELLNESS,
        entityReference: kind,
        metadata: { route, kind },
        idempotencyKey,
        email: { enabled: false },
      }),
    );
  }

  /** WhatsApp needs a Meta-approved template for messages people didn't start. Body params: title, message. */
  private async sendWhatsApp(phone: string, language: string, text: { title: string; body: string }) {
    if (!this.whatsappAvailable()) return;
    const languages = String(this.config?.get('NUDGE_WHATSAPP_LANGUAGES') ?? 'en').split(',').map((l) => l.trim());
    try {
      await this.whatsapp!.sendTemplate!({
        to: phone,
        template: String(this.config!.get('NUDGE_WHATSAPP_TEMPLATE')),
        language: languages.includes(language) ? language : languages[0] || 'en',
        bodyParams: [text.title, text.body],
      });
    } catch {
      this.logger.warn('WhatsApp nudge failed');
    }
  }

  private isDue(now: Date, timezone: string, localTime: string): boolean {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]),
    );
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    const [h, m] = localTime.split(':').map(Number);
    const elapsed = minutes - (h * 60 + m);
    return elapsed >= 0 && elapsed < WINDOW_MINUTES;
  }
}
