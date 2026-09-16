import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Notifications outbox migration', () => {
  const source = readFileSync(join(__dirname, 'migrations/1794931200000-NotificationsOutbox.ts'), 'utf8');

  it('creates reusable notifications and email outbox tables only', () => {
    expect(source).toContain('CREATE TABLE "notifications"');
    expect(source).toContain('CREATE TABLE "notification_outbox"');
    expect(source).toContain('"user_id" uuid NOT NULL');
    expect(source).toContain('"notification_id" uuid NOT NULL');
    expect(source).toContain('"metadata" jsonb');
    expect(source).toContain('"idempotency_key"');
    expect(source).toContain('IDX_notifications_user_created');
    expect(source).toContain('IDX_notifications_user_read_created');
    expect(source).toContain('IDX_notification_outbox_pending');
    expect(source).toContain('IDX_notification_outbox_processing');
    expect(source).not.toContain('CREATE TYPE');
    expect(source).not.toContain('care_requests" ADD');
    expect(source).not.toContain('providers" ADD');
  });
});
