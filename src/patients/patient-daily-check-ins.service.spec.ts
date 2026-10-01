import { NotFoundException } from "@nestjs/common";

import { User } from "../users/entities/user.entity";
import { PatientDailyCheckInsService } from "./patient-daily-check-ins.service";

describe("PatientDailyCheckInsService", () => {
  const user = { id: "user-a" } as User;
  let insert: any;
  let select: any;
  let patients: any;
  let progress: any;
  let service: PatientDailyCheckInsService;

  beforeEach(() => {
    insert = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    select = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { localDate: "2026-10-01", mood: 4, energy: 3, sleep: null },
      ]),
    };
    const checkIns = { createQueryBuilder: jest.fn((alias?: string) => (alias ? select : insert)) };
    patients = { findOne: jest.fn().mockResolvedValue({ id: "patient-a", deletedAt: null }) };
    progress = { progress: jest.fn().mockResolvedValue({ streakDays: 1 }) };
    service = new PatientDailyCheckInsService(checkIns as never, patients, progress);
  });

  it("upserts today's check-in in the patient's timezone and returns progress", async () => {
    // 23:30 UTC on 30 Sep is already 1 Oct in Lagos.
    const now = new Date("2026-09-30T23:30:00Z");
    const result = await service.upsertToday(user, { mood: 4, sleep: 2, timezone: "Africa/Lagos" }, now);

    expect(insert.values).toHaveBeenCalledWith({
      patientId: "patient-a",
      localDate: "2026-10-01",
      mood: 4,
      energy: null,
      sleep: 2,
      timezone: "Africa/Lagos",
    });
    expect(insert.orUpdate).toHaveBeenCalledWith(
      ["mood", "energy", "sleep", "timezone", "updated_at"],
      ["patient_id", "local_date"],
    );
    expect(progress.progress).toHaveBeenCalledWith("patient-a", "Africa/Lagos", now);
    expect(result).toEqual({ streakDays: 1 });
  });

  it("lists only the patient's own recent check-ins, clamped to 31 days", async () => {
    const now = new Date("2026-10-01T10:00:00Z");
    const result = await service.list(user, 400, "Africa/Lagos", now);
    expect(select.where).toHaveBeenCalledWith("checkIn.patient_id = :patientId", { patientId: "patient-a" });
    expect(select.andWhere).toHaveBeenCalledWith("checkIn.local_date >= :from", { from: "2026-09-01" });
    expect(result.items).toEqual([{ localDate: "2026-10-01", mood: 4, energy: 3, sleep: null }]);
  });

  it("refuses users without an active patient profile", async () => {
    patients.findOne.mockResolvedValue(null);
    await expect(
      service.upsertToday(user, { mood: 3, timezone: "Africa/Lagos" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
