import { PushDevicesService } from './push-devices.service';
import { PushDevicePlatform } from '../enums/push-device-platform.enum';

describe('PushDevicesService', () => {
  it('supports multiple devices and reassigns a token without retaining queued old-owner delivery', async () => {
    const rows: any[] = [];
    const devices = {
      findOne: jest.fn(async ({ where }: any) => rows.find((row) => row.token === where.token) ?? null),
      create: jest.fn((value) => ({ id: `device-${rows.length + 1}`, ...value })),
      save: jest.fn(async (value) => { const index = rows.findIndex((row) => row.id === value.id); if (index >= 0) rows[index] = value; else rows.push(value); return value; }),
    };
    const pushOutbox = { createQueryBuilder: jest.fn(() => ({ delete: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn() })) };
    const service = new PushDevicesService(devices as any, pushOutbox as any);

    await service.register('user-a', { platform: PushDevicePlatform.ANDROID, token: 'token-a' });
    await service.register('user-a', { platform: PushDevicePlatform.IOS, token: 'token-b' });
    expect(rows).toHaveLength(2);

    await service.register('user-b', { platform: PushDevicePlatform.ANDROID, token: 'token-a' });
    expect(rows.find((row) => row.token === 'token-a')).toMatchObject({ userId: 'user-b', isActive: true });
    expect(pushOutbox.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('unregisters only the current user token', async () => {
    const row = { id: 'device-1', userId: 'user-a', token: 'token-a', isActive: true };
    const devices = { findOne: jest.fn(async () => row), save: jest.fn(async (value) => value) };
    const service = new PushDevicesService(devices as any, {} as any);

    await expect(service.unregister('user-a', ' token-a ')).resolves.toEqual({ unregistered: true });
    expect(row.isActive).toBe(false);
    expect(devices.save).toHaveBeenCalledWith(row);
  });
});

describe('PushDevicesService web subscriptions', () => {
  it('deactivates only the current user browser subscription for an endpoint', async () => {
    const { webPushToken } = jest.requireActual('./web-push.provider');
    const keys = { p256dh: 'p', auth: 'a' };
    const mine = { id: 'd1', userId: 'user-a', platform: 'WEB', isActive: true, token: webPushToken({ endpoint: 'https://fcm.googleapis.com/fcm/send/one', keys }) };
    const other = { id: 'd2', userId: 'user-a', platform: 'WEB', isActive: true, token: webPushToken({ endpoint: 'https://fcm.googleapis.com/fcm/send/two', keys }) };
    const devices = { find: jest.fn(async () => [mine, other]), save: jest.fn(async (value) => value) };
    const service = new PushDevicesService(devices as any, {} as any);

    await expect(service.unregisterWebEndpoint('user-a', 'https://fcm.googleapis.com/fcm/send/one')).resolves.toEqual({ unregistered: true });
    expect(devices.find).toHaveBeenCalledWith({ where: { userId: 'user-a', platform: PushDevicePlatform.WEB, isActive: true } });
    expect(mine.isActive).toBe(false);
    expect(other.isActive).toBe(true);
  });
});
