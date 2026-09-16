import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserPushDevice } from '../entities/user-push-device.entity';
import { NotificationPushOutbox } from '../entities/notification-push-outbox.entity';
import { PushDevicePlatform } from '../enums/push-device-platform.enum';

@Injectable()
export class PushDevicesService {
  constructor(
    @InjectRepository(UserPushDevice) private readonly devices: Repository<UserPushDevice>,
    @InjectRepository(NotificationPushOutbox) private readonly pushOutbox: Repository<NotificationPushOutbox>,
  ) {}

  async register(userId: string, input: { token: string; platform: PushDevicePlatform; installationId?: string }): Promise<{ registered: true }> {
    const token = input.token.trim();
    const existing = await this.devices.findOne({ where: { token } });
    if (existing) {
      if (existing.userId !== userId) {
        await this.pushOutbox.createQueryBuilder().delete().where('device_id = :deviceId', { deviceId: existing.id }).execute();
      }
      existing.userId = userId;
      existing.platform = input.platform;
      existing.installationId = input.installationId ?? null;
      existing.isActive = true;
      existing.lastSeenAt = new Date();
      await this.devices.save(existing);
      return { registered: true };
    }
    await this.devices.save(this.devices.create({
      userId,
      platform: input.platform,
      token,
      installationId: input.installationId ?? null,
      isActive: true,
      lastSeenAt: new Date(),
    }));
    return { registered: true };
  }

  async unregister(userId: string, token: string): Promise<{ unregistered: true }> {
    const device = await this.devices.findOne({ where: { userId, token: token.trim() } });
    if (device) {
      device.isActive = false;
      device.lastSeenAt = new Date();
      await this.devices.save(device);
    }
    return { unregistered: true };
  }

  async deactivate(deviceId: string, token: string): Promise<void> {
    await this.devices
      .createQueryBuilder()
      .update(UserPushDevice)
      .set({ isActive: false, lastSeenAt: () => 'NOW()' })
      .where('id = :deviceId AND token = :token', { deviceId, token })
      .execute();
  }
}
