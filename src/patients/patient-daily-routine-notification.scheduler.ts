import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { NotificationEntityType } from "../notifications/enums/notification-entity-type.enum";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { NotificationsService } from "../notifications/notifications.service";
import { PatientDailyRoutine } from "./entities/patient-daily-routine.entity";

const INTERVAL_MS = 60_000;
const CATCH_UP_MINUTES = 60;

@Injectable()
export class PatientDailyRoutineNotificationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    PatientDailyRoutineNotificationScheduler.name,
  );
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(PatientDailyRoutine)
    private readonly routines: Repository<PatientDailyRoutine>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      this.dispatchDue().catch((error) =>
        this.logger.warn(
          `Daily routine dispatch failed: ${error instanceof Error ? error.name : "UNKNOWN"}`,
        ),
      );
    }, INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async dispatchDue(now = new Date()): Promise<{ processed: number }> {
    if (this.running) return { processed: 0 };
    this.running = true;
    try {
      const rows = await this.routines.find({
        where: { enabled: true },
        relations: { patient: true },
        order: { createdAt: "ASC" },
      });
      let processed = 0;
      for (const row of rows) {
        if (!row.patient?.userId || !this.isDue(row, now)) continue;
        const localDate = this.localParts(now, row.timezone).date;
        await this.dataSource.transaction((manager) =>
          this.notifications.createTransactionalNotification(manager, {
            userId: row.patient.userId!,
            type: NotificationType.DAILY_ROUTINE_DUE,
            title: "Your SmartClinic routine",
            message: `${row.label} is scheduled for ${row.scheduledLocalTime.slice(0, 5)}.`,
            entityType: NotificationEntityType.DAILY_ROUTINE,
            entityReference: row.reference,
            metadata: {
              routineType: row.type,
              scheduledLocalTime: row.scheduledLocalTime.slice(0, 5),
              timezone: row.timezone,
            },
            idempotencyKey: `daily-routine:${row.id}:${localDate}`,
            email: { enabled: false },
          }),
        );
        processed += 1;
      }
      return { processed };
    } finally {
      this.running = false;
    }
  }

  private isDue(row: PatientDailyRoutine, now: Date): boolean {
    const local = this.localParts(now, row.timezone);
    if (!row.daysOfWeek.includes(local.weekday)) return false;
    const [hour, minute] = row.scheduledLocalTime.split(":").map(Number);
    const elapsed = local.minutes - (hour * 60 + minute);
    return elapsed >= 0 && elapsed < CATCH_UP_MINUTES;
  }

  private localParts(
    date: Date,
    timezone: string,
  ): { date: string; weekday: number; minutes: number } {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        parts.weekday,
      ),
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
  }
}
