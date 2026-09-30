import { BadRequestException, NotFoundException } from "@nestjs/common";

import { User } from "../users/entities/user.entity";
import {
  PatientDailyRoutineSource,
  PatientDailyRoutineType,
} from "./enums/patient-daily-routine.enum";
import { PatientDailyRoutinesService } from "./patient-daily-routines.service";

describe("PatientDailyRoutinesService", () => {
  const user = { id: "user-a" } as User;
  const patient = { id: "patient-a", deletedAt: null };
  let rows: any[];
  let routines: any;
  let patients: any;
  let service: PatientDailyRoutinesService;

  beforeEach(() => {
    rows = [];
    routines = {
      find: jest.fn().mockImplementation(async () => rows),
      findOne: jest
        .fn()
        .mockImplementation(
          async ({ where }: any) =>
            rows.find(
              (row) =>
                row.reference === where.reference &&
                row.patientId === where.patientId,
            ) ?? null,
        ),
      create: jest.fn((value) => ({
        id: "routine-id",
        reference: "SC-RTE-ABCDEF123456",
        createdAt: new Date(),
        ...value,
      })),
      save: jest.fn(async (value) => value),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    patients = { findOne: jest.fn().mockResolvedValue(patient) };
    service = new PatientDailyRoutinesService(routines, patients);
  });

  const createDto = (type = PatientDailyRoutineType.HYDRATION) => ({
    type,
    label: "Take a water break",
    scheduledLocalTime: "09:00",
    timezone: "Africa/Lagos",
    daysOfWeek: [1, 2, 3, 4, 5],
  });

  it("creates an optional patient-owned routine without clinical provenance", async () => {
    const result = await service.create(user, createDto());
    expect(result).toMatchObject({
      reference: "SC-RTE-ABCDEF123456",
      source: PatientDailyRoutineSource.PATIENT,
      enabled: true,
    });
    expect(routines.save).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: "patient-a",
        sourceReference: null,
      }),
    );
  });

  it("requires an explicit safety acknowledgement for personal medication reminders", async () => {
    await expect(
      service.create(user, createDto(PatientDailyRoutineType.MEDICATION)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(user, {
        ...createDto(PatientDailyRoutineType.MEDICATION),
        medicationSafetyAcknowledged: true,
      }),
    ).resolves.toMatchObject({ type: PatientDailyRoutineType.MEDICATION });
  });

  it("returns no more than three routines scheduled for the patient local weekday", async () => {
    rows = Array.from({ length: 5 }, (_, index) => ({
      reference: `SC-RTE-${index}`,
      patientId: "patient-a",
      type: PatientDailyRoutineType.MOVEMENT,
      label: `Move ${index}`,
      instructions: null,
      scheduledLocalTime: `0${index + 8}:00:00`,
      timezone: "Africa/Lagos",
      daysOfWeek: [1],
      enabled: true,
      source: PatientDailyRoutineSource.PATIENT,
    }));
    const result = await service.today(
      "patient-a",
      new Date("2026-09-28T08:00:00Z"),
    );
    expect(result).toHaveLength(3);
  });

  it("cannot update or remove another patient routine", async () => {
    rows = [{ reference: "SC-RTE-OTHER", patientId: "patient-b" }];
    await expect(
      service.update(user, "SC-RTE-OTHER", { enabled: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    routines.delete.mockResolvedValueOnce({ affected: 0 });
    await expect(service.remove(user, "SC-RTE-OTHER")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
