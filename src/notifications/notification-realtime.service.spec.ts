import { NotificationRealtimeService } from './notification-realtime.service';

describe('NotificationRealtimeService', () => {
  const notification = {
    reference: 'SC-NOT-1',
    type: 'CARE_REQUEST_ASSIGNED',
    title: 'New care request',
    message: 'A patient has requested care.',
    entityType: 'CARE_REQUEST',
    entityReference: 'CR-1',
    actionType: 'VIEW',
    metadata: null,
    readAt: null,
    createdAt: new Date(),
  };

  it('delivers only to subscribers for the authenticated user', () => {
    const broker = new NotificationRealtimeService();
    const userA: unknown[] = [];
    const userB: unknown[] = [];
    const subscriptionA = broker.stream('user-a').subscribe((event) => userA.push(event));
    const subscriptionB = broker.stream('user-b').subscribe((event) => userB.push(event));

    broker.publish('user-a', notification);

    expect(userA).toHaveLength(1);
    expect(userB).toHaveLength(0);
    expect(userA[0]).toMatchObject({ type: 'notification', data: notification });
    subscriptionA.unsubscribe();
    subscriptionB.unsubscribe();
    broker.onModuleDestroy();
  });

  it('delivers to multiple tabs and cleans up disconnected subscribers', () => {
    const broker = new NotificationRealtimeService();
    const first: unknown[] = [];
    const second: unknown[] = [];
    const firstSubscription = broker.stream('user-a').subscribe((event) => first.push(event));
    const secondSubscription = broker.stream('user-a').subscribe((event) => second.push(event));

    broker.publish('user-a', notification);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    firstSubscription.unsubscribe();
    broker.publish('user-a', { ...notification, reference: 'SC-NOT-2' });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    secondSubscription.unsubscribe();
    broker.onModuleDestroy();
  });
});
