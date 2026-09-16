import { Controller, Get, MessageEvent, Param, Patch, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationListQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';
import { NotificationRealtimeService } from './notification-realtime.service';

@Controller('me/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly realtime: NotificationRealtimeService) {}

  @Sse('stream')
  stream(@Req() req: { user: { id: string } }): Observable<MessageEvent> {
    return this.realtime.stream(req.user.id);
  }

  @Get()
  list(@Req() req: { user: { id: string } }, @Query() query: NotificationListQueryDto) {
    return this.notifications.listMine(req.user.id, query.page, query.limit);
  }

  @Get('unread-count')
  unreadCount(@Req() req: { user: { id: string } }) {
    return this.notifications.unreadCount(req.user.id);
  }

  @Patch(':reference/read')
  markRead(@Req() req: { user: { id: string } }, @Param('reference') reference: string) {
    return this.notifications.markRead(req.user.id, reference);
  }

  @Patch('read-all')
  markAllRead(@Req() req: { user: { id: string } }) {
    return this.notifications.markAllRead(req.user.id);
  }
}
