import { NotFoundException } from "@nestjs/common";

import { User } from "../users/entities/user.entity";
import {
  localDateIn,
  longestStreak,
  PatientDailyRoutineCompletionsService,
  streakEndingAt,
} from "./patient-daily-routine-completions.service";

describe("PatientDailyRoutineCompletionsService", () => {
  const user = { id: "user-a" } as User;
  const routine = {
    id: "routine-1",
    reference: "SC-RTE-ABCDEF123456",
    patientId: "patient-a",
    timezone: "Africa/Lagos",
    enabled: true,
  };
  let completions: any;
  let routines: any;
  let patients: any;
  let insertBuilder: any;
  let rows: { localDate: string; reference: string }[];
  let checkInRows: { localDate: string; mood: number; energy: number | null; sleep: number | null }[];
  let checkIns: any;
  let service: PatientDailyRoutineCompletionsService;

  beforeEach(() => {
    rows = [];
    checkInRows = [];
    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    const selectBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockImplementation(async () => rows),
    };
    const checkInBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockImplementation(async () => checkInRows),
    };
    checkIns = { createQueryBuilder: jest.fn(() => checkInBuilder) };
    completions = {
      createQueryBuilder: jest.fn((alias?: string) =>
        alias ? selectBuilder : insertBuilder,
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    routines = {
      findOne: jest
        .fn()
        .mockImplementation(async ({ where }: any) =>
          where.reference === routine.reference &&
          where.patientId === routine.patientId
            ? routine
            : null,
        ),
    };
    patients = {
      findOne: jest.fn().mockResolvedValue({ id: "patient-a", deletedAt: null }),
    };
    service = new PatientDailyRoutineCompletionsService(
      completions,
      routines,
      patients,
      checkIns,
    );
  });

  it("records today's tick in the routine's own timezone, idempotently", async () => {
    // 23:30 UTC on 30 Sep is already 1 Oct in Lagos (UTC+1).
    const now = new Date("2026-09-30T23:30:00Z");
    rows = [{ localDate: "2026-10-01", reference: routine.reference }];

    const progress = await service.complete(user, routine.reference, now);

    expect(insertBuilder.values).toHaveBeenCalledWith({
      routineId: "routine-1",
      patientId: "patient-a",
      localDate: "2026-10-01",
    });
    expect(insertBuilder.orIgnore).toHaveBeenCalled();
    expect(progress).toMatchObject({
      localDate: "2026-10-01",
      completedReferences: [routine.reference],
      streakDays: 1,
      bestStreak: 1,
      todayCheckIn: null,
    });
    expect(progress.week).toHaveLength(7);
    expect(progress.week[6]).toEqual({ localDate: "2026-10-01", active: true });
    expect(progress.week[0]).toEqual({ localDate: "2026-09-25", active: false });
  });

  it("undoes only today's tick", async () => {
    const now = new Date("2026-10-01T10:00:00Z");
    await service.undo(user, routine.reference, now);
    expect(completions.delete).toHaveBeenCalledWith({
      routineId: "routine-1",
      localDate: "2026-10-01",
    });
  });

  it("refuses routines that are not the patient's own enabled routine", async () => {
    await expect(
      service.complete(user, "SC-RTE-SOMEONEELSE00"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("counts consecutive days and keeps yesterday's streak alive until today ends", () => {
    const days = new Set(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(streakEndingAt("2026-09-30", days)).toBe(3);
    expect(streakEndingAt("2026-10-01", days)).toBe(3);
    expect(streakEndingAt("2026-10-02", days)).toBe(0);
    expect(streakEndingAt("2026-10-01", new Set())).toBe(0);
  });

  it("formats local dates across timezones", () => {
    const instant = new Date("2026-10-01T02:00:00Z");
    expect(localDateIn(instant, "Africa/Lagos")).toBe("2026-10-01");
    expect(localDateIn(instant, "America/New_York")).toBe("2026-09-30");
  });

  it("counts check-in days towards the streak and reports today's check-in", async () => {
    const now = new Date("2026-10-01T10:00:00Z");
    rows = [{ localDate: "2026-09-29", reference: routine.reference }];
    checkInRows = [
      { localDate: "2026-09-30", mood: 4, energy: null, sleep: 3 },
      { localDate: "2026-10-01", mood: 5, energy: 4, sleep: null },
    ];
    const progress = await service.progress("patient-a", "Africa/Lagos", now);
    expect(progress.streakDays).toBe(3);
    expect(progress.bestStreak).toBe(3);
    expect(progress.todayCheckIn).toEqual({ mood: 5, energy: 4, sleep: null });
    expect(progress.completedReferences).toEqual([]);
    expect(progress.week.filter((day) => day.active).map((day) => day.localDate)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });

  it("finds the longest run of active days", () => {
    expect(longestStreak(new Set())).toBe(0);
    expect(
      longestStreak(new Set(["2026-09-01", "2026-09-02", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-30"])),
    ).toBe(3);
    expect(longestStreak(new Set(["2026-02-28", "2026-03-01"]))).toBe(2);
  });
});

/**
 * The mocks above never build SQL, which let an unquoted camelCase alias
 * ("checkIn.local_date::text") reach staging, where Postgres folds it to
 * "checkin" and every dashboard load failed. This builds the real queries.
 */
describe("PatientDailyRoutineCompletionsService SQL", () => {
  it("quotes every table alias in the progress queries", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DataSource, SelectQueryBuilder } = require("typeorm");
    const dataSource = new DataSource({
      type: "postgres",
      entities: [`${__dirname}/../**/*.entity.{ts,js}`],
    });
    await dataSource.buildMetadatas();
    const sql: string[] = [];
    const spy = jest
      .spyOn(SelectQueryBuilder.prototype, "getRawMany")
      .mockImplementation(function (this: { getQuery(): string }) {
        sql.push(this.getQuery());
        return Promise.resolve([]);
      });
    try {
      const { PatientDailyRoutineCompletion } = await import("./entities/patient-daily-routine-completion.entity");
      const { PatientDailyRoutine } = await import("./entities/patient-daily-routine.entity");
      const { PatientDailyCheckIn } = await import("./entities/patient-daily-check-in.entity");
      const { Patient } = await import("./entities/patient.entity");
      const service = new PatientDailyRoutineCompletionsService(
        dataSource.getRepository(PatientDailyRoutineCompletion),
        dataSource.getRepository(PatientDailyRoutine),
        dataSource.getRepository(Patient),
        dataSource.getRepository(PatientDailyCheckIn),
      );
      await service.progress("patient-a", "Africa/Lagos", new Date("2026-10-02T09:00:00Z"));
    } finally {
      spy.mockRestore();
    }
    expect(sql).toHaveLength(2);
    for (const query of sql) {
      // A camelCase alias is only safe when quoted; unquoted it is lower-cased by Postgres.
      expect(query).not.toMatch(/(^|[^"\w])checkIn\./);
    }
    expect(sql.join("\n")).toContain('"checkIn"."local_date"::text');
  });
});
