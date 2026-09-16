import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationResponseDto } from './dto/notification-response.dto';

type Subscriber = { next: (event: MessageEvent) => void; complete: () => void };

@Injectable()
export class NotificationRealtimeService implements OnModuleDestroy {
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly heartbeat = new Map<Subscriber, NodeJS.Timeout>();

  stream(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const entry: Subscriber = {
        next: (event) => subscriber.next(event),
        complete: () => subscriber.complete(),
      };
      const users = this.subscribers.get(userId) ?? new Set<Subscriber>();
      users.add(entry);
      this.subscribers.set(userId, users);
      const timer = setInterval(() => subscriber.next({ type: 'heartbeat', data: '' }), 25_000);
      timer.unref?.();
      this.heartbeat.set(entry, timer);

      return () => {
        clearInterval(timer);
        this.heartbeat.delete(entry);
        const current = this.subscribers.get(userId);
        current?.delete(entry);
        if (current?.size === 0) this.subscribers.delete(userId);
      };
    });
  }

  publish(userId: string, notification: NotificationResponseDto): void {
    const users = this.subscribers.get(userId);
    if (!users) return;
    for (const subscriber of users) subscriber.next({ type: 'notification', data: notification });
  }

  onModuleDestroy(): void {
    for (const subscribers of this.subscribers.values()) {
      for (const subscriber of subscribers) subscriber.complete();
    }
    this.subscribers.clear();
    for (const timer of this.heartbeat.values()) clearInterval(timer);
    this.heartbeat.clear();
  }
}
