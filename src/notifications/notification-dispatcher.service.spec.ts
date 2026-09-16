import { EmailSendOutcome } from './email/email-provider';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { NotificationOutboxChannel } from './enums/notification-outbox-channel.enum';
import { NotificationOutboxStatus } from './enums/notification-outbox-status.enum';
import { NotificationDispatcherService } from './notification-dispatcher.service';

describe('NotificationDispatcherService', () => {
  let rows: any[];
  let repository: any;
  let emailProvider: any;
  let service: NotificationDispatcherService;
  let lockMode: string | null;
  let onLocked: string | null;
  const now = new Date('2026-09-16T12:00:00.000Z');
  const config: any = {
    notifications: {
      dispatcherEnabled: false,
      dispatchBatchSize: 10,
      dispatchIntervalMs: 1000,
      emailMaxAttempts: 2,
      processingStaleAfterMs: 300000,
    },
    email: { fromAddress: 'no-reply@example.test', fromName: 'SmartClinic' },
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    lockMode = null;
    onLocked = null;
    rows = [makeRow('outbox-1')];
    repository = {
      createQueryBuilder: jest.fn(() => queryBuilder()),
      findOne: jest.fn(async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null),
      save: jest.fn(async (value: any) => {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          const index = rows.findIndex((row) => row.id === item.id);
          if (index >= 0) rows[index] = item;
        }
        return value;
      }),
      manager: {
        transaction: jest.fn(async (work) => work({ getRepository: (entity: any) => entity === NotificationOutbox ? repository : {} })),
      },
    };
    emailProvider = { sendTransactionalEmail: jest.fn().mockResolvedValue({ outcome: EmailSendOutcome.SENT }) };
    service = new NotificationDispatcherService(repository, config, emailProvider);
  });

  afterEach(() => jest.useRealTimers());

  function makeRow(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      channel: NotificationOutboxChannel.EMAIL,
      status: NotificationOutboxStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: null,
      lastAttemptAt: null,
      errorCode: null,
      idempotencyKey: `${id}:email`,
      createdAt: new Date('2026-09-16T10:00:00.000Z'),
      notification: {
        title: 'Care request accepted',
        message: 'Your care request has been accepted.',
        user: { email: 'patient@example.test', emailNormalized: 'patient@example.test' },
      },
      ...overrides,
    };
  }

  function eligible(row: any) {
    if (row.channel !== NotificationOutboxChannel.EMAIL) return false;
    if (row.attemptCount >= config.notifications.emailMaxAttempts) return false;
    if (row.status === NotificationOutboxStatus.PENDING) return !row.nextAttemptAt || row.nextAttemptAt <= now;
    if (row.status === NotificationOutboxStatus.FAILED) return Boolean(row.nextAttemptAt && row.nextAttemptAt <= now);
    if (row.status === NotificationOutboxStatus.PROCESSING) return Boolean(row.lastAttemptAt && row.lastAttemptAt <= new Date(now.getTime() - config.notifications.processingStaleAfterMs));
    return false;
  }

  function queryBuilder() {
    const builder: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      setLock: jest.fn((mode: string) => { lockMode = mode; return builder; }),
      setOnLocked: jest.fn((mode: string) => { onLocked = mode; return builder; }),
      getMany: jest.fn(async () => rows.filter(eligible).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).slice(0, 10)),
    };
    return builder;
  }

  it('claims a bounded batch with pessimistic_write and skip_locked before sending', async () => {
    await service.dispatchPending();
    expect(lockMode).toBe('pessimistic_write');
    expect(onLocked).toBe('skip_locked');
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'patient@example.test', idempotencyKey: 'outbox-1:email' }));
    expect(rows[0]).toMatchObject({ status: NotificationOutboxStatus.SENT, errorCode: null, attemptCount: 1 });
  });

  it('does not claim PROCESSING rows until stale, then recovers them', async () => {
    rows[0].status = NotificationOutboxStatus.PROCESSING;
    rows[0].lastAttemptAt = new Date(now.getTime() - 60_000);
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).not.toHaveBeenCalled();

    rows[0].lastAttemptAt = new Date(now.getTime() - 301_000);
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: NotificationOutboxStatus.SENT, attemptCount: 1 });
  });

  it('never claims SENT rows', async () => {
    rows[0].status = NotificationOutboxStatus.SENT;
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('retries FAILED rows only when due and below max attempts', async () => {
    rows[0].status = NotificationOutboxStatus.FAILED;
    rows[0].attemptCount = 1;
    rows[0].nextAttemptAt = new Date(now.getTime() + 1000);
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).not.toHaveBeenCalled();

    rows[0].nextAttemptAt = new Date(now.getTime() - 1000);
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledTimes(1);

    rows[0].status = NotificationOutboxStatus.FAILED;
    rows[0].attemptCount = 2;
    rows[0].nextAttemptAt = new Date(now.getTime() - 1000);
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it('uses the same email idempotency key on retry', async () => {
    emailProvider.sendTransactionalEmail.mockResolvedValueOnce({ outcome: EmailSendOutcome.UNAVAILABLE }).mockResolvedValueOnce({ outcome: EmailSendOutcome.SENT });
    await service.dispatchPending();
    expect(rows[0]).toMatchObject({ status: NotificationOutboxStatus.FAILED, errorCode: 'EMAIL_PROVIDER_UNAVAILABLE', attemptCount: 1 });
    rows[0].nextAttemptAt = new Date(now.getTime() - 1000);
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: 'outbox-1:email' }));
    expect(emailProvider.sendTransactionalEmail).toHaveBeenNthCalledWith(2, expect.objectContaining({ idempotencyKey: 'outbox-1:email' }));
  });

  it('marks missing recipient email as sent without endless retry', async () => {
    rows[0].notification.user.email = null;
    rows[0].notification.user.emailNormalized = null;
    await service.dispatchPending();
    expect(emailProvider.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ status: NotificationOutboxStatus.SENT, errorCode: null, attemptCount: 1 });
  });

  it('does not run overlapping dispatch cycles in one Nest process', async () => {
    jest.useRealTimers();
    let release!: () => void;
    emailProvider.sendTransactionalEmail.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ outcome: EmailSendOutcome.SENT }); }));
    const first = service.dispatchPending();
    await expect(service.dispatchPending()).resolves.toEqual({ processed: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toEqual({ processed: 1 });
    expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it('email provider failure does not alter unrelated business state', async () => {
    const careRequest = { status: 'AWAITING_PROVIDER_RESPONSE' };
    emailProvider.sendTransactionalEmail.mockRejectedValueOnce(new Error('provider down'));
    await service.dispatchPending();
    expect(careRequest.status).toBe('AWAITING_PROVIDER_RESPONSE');
    expect(rows[0]).toMatchObject({ status: NotificationOutboxStatus.FAILED, errorCode: 'Error' });
  });
});
