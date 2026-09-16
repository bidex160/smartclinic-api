import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';

import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { Notification } from './entities/notification.entity';
import { NotificationActionType } from './enums/notification-action-type.enum';
import { NotificationEntityType } from './enums/notification-entity-type.enum';
import { NotificationOutboxChannel } from './enums/notification-outbox-channel.enum';
import { NotificationOutboxStatus } from './enums/notification-outbox-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationPushOutbox } from './entities/notification-push-outbox.entity';
import { UserPushDevice } from './entities/user-push-device.entity';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: NotificationEntityType;
  entityReference: string;
  actionType?: NotificationActionType;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  email?: { enabled: boolean };
}

export type CreateProviderNotificationInput = Omit<CreateNotificationInput, 'userId'>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @Optional() private readonly realtime?: NotificationRealtimeService,
  ) {}

  async createTransactionalNotification(manager: EntityManager, input: CreateNotificationInput): Promise<Notification> {
    const repository = manager.getRepository(Notification);
    if (input.idempotencyKey) {
      const existing = await repository.findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }

    const user = await manager.getRepository(User).findOne({
      where: { id: input.userId },
      withDeleted: true,
      lock: { mode: 'pessimistic_read' },
    });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Notification recipient was not found');
    }

    try {
      const notification = await repository.save(repository.create({
        userId: user.id,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityReference: input.entityReference,
        actionType: input.actionType ?? NotificationActionType.VIEW,
        metadata: input.metadata ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        readAt: null,
      }));

      const email = user.emailNormalized || user.email;
      if (input.email?.enabled && email) {
        await manager.getRepository(NotificationOutbox).save(manager.getRepository(NotificationOutbox).create({
          notificationId: notification.id,
          channel: NotificationOutboxChannel.EMAIL,
          status: NotificationOutboxStatus.PENDING,
          attemptCount: 0,
          nextAttemptAt: null,
          lastAttemptAt: null,
          errorCode: null,
          idempotencyKey: `${input.idempotencyKey ?? notification.reference}:email`,
        }));
      }

      const devices = await manager.getRepository(UserPushDevice).find({ where: { userId: user.id, isActive: true } });
      if (devices.length) {
        const pushOutbox = manager.getRepository(NotificationPushOutbox);
        await pushOutbox.save(devices.map((device) => pushOutbox.create({
          notificationId: notification.id,
          deviceId: device.id,
          token: device.token,
          payload: {
            notificationReference: notification.reference,
            title: notification.title,
            body: notification.message,
            entityType: notification.entityType,
            entityReference: notification.entityReference,
            actionType: notification.actionType,
          },
          status: NotificationOutboxStatus.PENDING,
          attemptCount: 0,
          nextAttemptAt: null,
          lastAttemptAt: null,
          errorCode: null,
          idempotencyKey: `${input.idempotencyKey ?? notification.reference}:push:${device.id}`,
        })));
      }

      const mapped = this.map(notification);
      // Notification creation is invoked from transaction callbacks. Queue the
      // live signal after the callback yields so the transaction can commit;
      // persistence and email outbox remain independent of delivery.
      setImmediate(() => this.realtime?.publish(input.userId, mapped));
      return notification;
    } catch (error) {
      if (input.idempotencyKey && this.isUniqueViolation(error)) {
        const existing = await repository.findOne({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return existing;
      }
      throw error;
    }
  }

async createForProviderTransactional(
  manager: EntityManager,
  providerId: string | null | undefined,
  input: CreateProviderNotificationInput,
): Promise<Notification | null> {
  if (!providerId) return null;

  const provider = await manager.getRepository(Provider).findOne({
    where: { id: providerId },
    relations: { user: true },
    withDeleted: true,
  });

  if (
    !provider ||
    provider.deletedAt ||
    !provider.userId ||
    !provider.user ||
    provider.user.deletedAt ||
    provider.user.status !== UserStatus.ACTIVE
  ) {
    return null;
  }

  return this.createTransactionalNotification(manager, {
    ...input,
    userId: provider.userId,
  });
}

  async listMine(userId: string, page: number, limit: number) {
    const [rows, total] = await this.notifications.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', reference: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => this.map(row)),
      page,
      limit,
      total,
      totalPages: total ? Math.ceil(total / limit) : 0,
    };
  }

  async unreadCount(userId: string) {
    return { unreadCount: await this.notifications.count({ where: { userId, readAt: IsNull() } }) };
  }

  async markRead(userId: string, reference: string) {
    const notification = await this.notifications.findOne({ where: { reference, userId } });
    if (!notification) throw new NotFoundException('Notification was not found');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return this.map(notification);
  }

  async markAllRead(userId: string) {
    await this.notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: () => 'NOW()' })
      .where('user_id = :userId', { userId })
      .andWhere('read_at IS NULL')
      .execute();
    return this.unreadCount(userId);
  }

  map(notification: Notification): NotificationResponseDto {
    return {
      reference: notification.reference,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityReference: notification.entityReference,
      actionType: notification.actionType,
      metadata: notification.metadata,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && (error as { code?: string; driverError?: { code?: string } }).code === '23505'
      || typeof error === 'object' && error !== null && (error as { driverError?: { code?: string } }).driverError?.code === '23505';
  }
}
