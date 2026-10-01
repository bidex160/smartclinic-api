import { NotFoundException } from "@nestjs/common";

import { User } from "../users/entities/user.entity";
import {
  localDateIn,
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
  let service: PatientDailyRoutineCompletionsService;

  beforeEach(() => {
    rows = [];
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
    expect(progress).toEqual({
      localDate: "2026-10-01",
      completedReferences: [routine.reference],
      streakDays: 1,
    });
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
});
