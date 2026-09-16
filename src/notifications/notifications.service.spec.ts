import { NotFoundException } from '@nestjs/common';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { Notification } from './entities/notification.entity';
import { NotificationPushOutbox } from './entities/notification-push-outbox.entity';
import { UserPushDevice } from './entities/user-push-device.entity';
import { NotificationActionType } from './enums/notification-action-type.enum';
import { NotificationEntityType } from './enums/notification-entity-type.enum';
import { NotificationOutboxStatus } from './enums/notification-outbox-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let users: any[]; let providers: any[]; let notifications: any[]; let outboxRows: any[]; let manager: any; let service: NotificationsService; let repo: any;

  beforeEach(() => {
    users = [{ id: 'user-1', email: 'patient@example.test', emailNormalized: 'patient@example.test', status: UserStatus.ACTIVE, deletedAt: null }];
    providers = [{ id: 'provider-1', userId: 'user-1', deletedAt: null, user: users[0] }];
    notifications = []; outboxRows = [];
    repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        if (!value.id) value.id = `notification-${notifications.length + 1}`;
        if (!value.reference) value.reference = `SC-NOT-${notifications.length + 1}`;
        if (!value.createdAt) value.createdAt = new Date();
        const index = notifications.findIndex((row) => row.id === value.id);
        if (index >= 0) notifications[index] = value;
        else notifications.push(value);
        return value;
      }),
      findOne: jest.fn(async ({ where }: any) => notifications.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null),
      findAndCount: jest.fn(async () => [notifications, notifications.length]),
      count: jest.fn(async () => notifications.filter((row) => !row.readAt).length),
      createQueryBuilder: jest.fn(() => ({ update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), execute: jest.fn(async () => { notifications.forEach((row) => { if (!row.readAt) row.readAt = new Date(); }); }) })),
    };
    const outbox = { create: jest.fn((value) => value), save: jest.fn(async (value) => { outboxRows.push(value); return value; }) };
    const devices = { find: jest.fn(async () => []) };
    const pushOutbox = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const userRepo = { findOne: jest.fn(async ({ where }: any) => users.find((row) => row.id === where.id) ?? null) };
    const providerRepo = { findOne: jest.fn(async ({ where }: any) => providers.find((row) => row.id === where.id) ?? null) };
    manager = { getRepository: jest.fn((entity) => entity === Notification ? repo : entity === NotificationOutbox ? outbox : entity === NotificationPushOutbox ? pushOutbox : entity === UserPushDevice ? devices : entity === User ? userRepo : entity === Provider ? providerRepo : {}) };
    service = new NotificationsService(repo);
  });

  const input = {
    userId: 'user-1',
    type: NotificationType.CARE_REQUEST_ACCEPTED,
    title: 'Care request accepted',
    message: 'Your care request has been accepted.',
    entityType: NotificationEntityType.CARE_REQUEST,
    entityReference: 'SC-CARE-123',
    actionType: NotificationActionType.VIEW,
    idempotencyKey: 'care-request:SC-CARE-123:accepted',
  };

  it('creates in-app notification and email outbox when recipient has email', async () => {
    await service.createTransactionalNotification(manager, { ...input, email: { enabled: true } });
    expect(notifications).toHaveLength(1);
    expect(outboxRows).toEqual([expect.objectContaining({ status: NotificationOutboxStatus.PENDING, idempotencyKey: `${input.idempotencyKey}:email` })]);
  });

  it('creates in-app notification without email outbox when email is missing', async () => {
    users[0].email = null; users[0].emailNormalized = null;
    await service.createTransactionalNotification(manager, { ...input, email: { enabled: true } });
    expect(notifications).toHaveLength(1);
    expect(outboxRows).toHaveLength(0);
  });

  it('returns existing notification for duplicate idempotency key', async () => {
    const first = await service.createTransactionalNotification(manager, input);
    const second = await service.createTransactionalNotification(manager, input);
    expect(second).toBe(first);
    expect(notifications).toHaveLength(1);
  });

  it('safely skips provider notifications without an active linked user', async () => {
    providers[0].userId = null; providers[0].user = null;
    await expect(service.createForProviderTransactional(manager, 'provider-1', input)).resolves.toBeNull();
    expect(notifications).toHaveLength(0);
  });

  it('rejects direct notifications for inactive/missing users', async () => {
    users[0].status = UserStatus.SUSPENDED;
    await expect(service.createTransactionalNotification(manager, input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists newest, counts unread, and marks read idempotently', async () => {
    const notification = await service.createTransactionalNotification(manager, input);
    await expect(service.unreadCount('user-1')).resolves.toEqual({ unreadCount: 1 });
    await expect(service.markRead('user-1', notification.reference)).resolves.toMatchObject({ reference: notification.reference, readAt: expect.any(Date) });
    await expect(service.markRead('user-1', notification.reference)).resolves.toMatchObject({ reference: notification.reference });
    await service.markAllRead('user-1');
    await expect(service.listMine('user-1', 1, 20)).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ entityReference: 'SC-CARE-123' })] });
  });
});
