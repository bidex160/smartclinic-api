import { NotFoundException } from "@nestjs/common";

import { User } from "../users/entities/user.entity";
import { PatientHealthBasicsService } from "./patient-health-basics.service";

describe("PatientHealthBasicsService", () => {
  const user = { id: "user-a" } as User;
  let stored: any;
  let basics: any;
  let patients: any;
  let service: PatientHealthBasicsService;

  beforeEach(() => {
    stored = null;
    basics = {
      findOne: jest.fn(async () => stored),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => (stored = { ...value, updatedAt: new Date("2026-10-01T10:00:00Z") })),
    };
    patients = { findOne: jest.fn().mockResolvedValue({ id: "patient-a", deletedAt: null }) };
    service = new PatientHealthBasicsService(basics, patients);
  });

  it("returns an empty, clearly self-reported record before anything is saved", async () => {
    await expect(service.get(user)).resolves.toEqual({
      bloodGroup: null,
      genotype: null,
      allergies: null,
      conditions: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      source: "SELF_REPORTED",
      updatedAt: null,
    });
  });

  it("creates on first save and keeps omitted fields on later partial updates", async () => {
    await service.update(user, { bloodGroup: "O+", genotype: "AS", allergies: "Penicillin" });
    expect(basics.save).toHaveBeenCalledWith(expect.objectContaining({ patientId: "patient-a", bloodGroup: "O+", genotype: "AS" }));

    const result = await service.update(user, { allergies: null, emergencyContactName: "Ngozi" });
    expect(result).toMatchObject({
      bloodGroup: "O+",
      genotype: "AS",
      allergies: null,
      emergencyContactName: "Ngozi",
      source: "SELF_REPORTED",
      updatedAt: "2026-10-01T10:00:00.000Z",
    });
  });

  it("refuses users without an active patient profile", async () => {
    patients.findOne.mockResolvedValue(null);
    await expect(service.get(user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
