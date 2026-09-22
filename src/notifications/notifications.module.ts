import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { appConfig } from '../config/app.config';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { EmailModule } from './email/email.module';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { Notification } from './entities/notification.entity';
import { NotificationPushOutbox } from './entities/notification-push-outbox.entity';
import { UserPushDevice } from './entities/user-push-device.entity';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { AuthModule } from '../auth/auth.module';
import { PushDevicesController } from './push/push-devices.controller';
import { PushDevicesService } from './push/push-devices.service';
import { PUSH_PROVIDER } from './push/push-provider';
import { FirebasePushProvider } from './push/firebase-push.provider';
import { UnavailablePushProvider } from './push/unavailable-push.provider';
import { PushNotificationDispatcherService } from './push/push-notification-dispatcher.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    EmailModule,
    AuthModule,
    TypeOrmModule.forFeature([Notification, NotificationOutbox, NotificationPushOutbox, UserPushDevice, User, Provider]),
  ],
  controllers: [NotificationsController, PushDevicesController],
  providers: [
    NotificationsService,
    NotificationDispatcherService,
    NotificationRealtimeService,
    PushDevicesService,
    FirebasePushProvider,
    UnavailablePushProvider,
    PushNotificationDispatcherService,
    {
      provide: PUSH_PROVIDER,
      inject: [appConfig.KEY, FirebasePushProvider, UnavailablePushProvider],
      useFactory: (config: any, firebase: FirebasePushProvider, unavailable: UnavailablePushProvider) => config.notifications.push.provider === 'firebase' ? firebase : unavailable,
    },
  ],
  exports: [NotificationsService, NotificationDispatcherService, NotificationRealtimeService, PushDevicesService],
})
export class NotificationsModule {}
