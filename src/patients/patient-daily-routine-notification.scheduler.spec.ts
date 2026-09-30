import { PatientDailyRoutineType } from "./enums/patient-daily-routine.enum";
import { PatientDailyRoutineNotificationScheduler } from "./patient-daily-routine-notification.scheduler";

describe("PatientDailyRoutineNotificationScheduler", () => {
  const row: any = {
    id: "routine-id",
    reference: "SC-RTE-ABCDEF123456",
    enabled: true,
    type: PatientDailyRoutineType.MEDICATION,
    label: "Take my evening medicine",
    scheduledLocalTime: "19:00:00",
    timezone: "Africa/Lagos",
    daysOfWeek: [1],
    patient: { userId: "user-id" },
    createdAt: new Date(),
  };
  let routines: any;
  let notifications: any;
  let dataSource: any;
  let scheduler: PatientDailyRoutineNotificationScheduler;

  beforeEach(() => {
    routines = { find: jest.fn().mockResolvedValue([row]) };
    notifications = {
      createTransactionalNotification: jest.fn().mockResolvedValue({}),
    };
    dataSource = { transaction: jest.fn((work) => work({ name: "manager" })) };
    scheduler = new PatientDailyRoutineNotificationScheduler(
      routines,
      dataSource,
      notifications,
    );
  });

  it("creates one idempotent in-app/push notification in the routine local due window", async () => {
    await expect(
      scheduler.dispatchDue(new Date("2026-09-28T18:05:00Z")),
    ).resolves.toEqual({ processed: 1 });
    expect(notifications.createTransactionalNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-id",
        idempotencyKey: "daily-routine:routine-id:2026-09-28",
        email: { enabled: false },
      }),
    );
  });

  it("does not notify outside the configured local day or one-hour catch-up window", async () => {
    await expect(
      scheduler.dispatchDue(new Date("2026-09-28T20:01:00Z")),
    ).resolves.toEqual({ processed: 0 });
    expect(
      notifications.createTransactionalNotification,
    ).not.toHaveBeenCalled();
  });
});
