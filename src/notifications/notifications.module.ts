import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { appConfig } from '../config/app.config';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { EmailModule } from './email/email.module';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { Notification } from './entities/notification.entity';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    EmailModule,
    AuthModule,
    TypeOrmModule.forFeature([Notification, NotificationOutbox, User, Provider]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDispatcherService, NotificationRealtimeService],
  exports: [NotificationsService, NotificationDispatcherService, NotificationRealtimeService],
})
export class NotificationsModule {}
