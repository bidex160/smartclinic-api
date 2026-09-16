import { Notification } from './entities/notification.entity';
import { NotificationActionType } from './enums/notification-action-type.enum';
import { NotificationEntityType } from './enums/notification-entity-type.enum';
import { NotificationType } from './enums/notification-type.enum';
import { buildNotificationEmail } from './notification-email-content';
import { UserRole } from '../users/enums/user-role.enum';

describe('notification email content', () => {
  const config: any = { frontendUrl: 'https://smartclinicnetwork.com', email: { logoUrl: null } };

  function notification(type: NotificationType, entityType = NotificationEntityType.CARE_REQUEST, roles = [UserRole.USER]): Notification {
    return {
      type,
      title: 'Unsafe <title>',
      message: 'Sensitive notes should not be copied',
      entityType,
      entityReference: entityType === NotificationEntityType.CARE_APPOINTMENT ? 'SC-APT-1' : 'SC-CARE-1',
      actionType: NotificationActionType.VIEW,
      metadata: { internalId: 'provider-secret', notes: 'clinical notes' },
      user: { roles } as any,
    } as unknown as Notification;
  }

  it.each(Object.values(NotificationType))('renders privacy-safe standard content for %s', (type) => {
    const entityType = type.startsWith('CARE_APPOINTMENT') ? NotificationEntityType.CARE_APPOINTMENT : type.startsWith('PROVIDER') ? NotificationEntityType.PROVIDER_PROFILE : NotificationEntityType.CARE_REQUEST;
    const roles = type.startsWith('PROVIDER') || type === NotificationType.CARE_REQUEST_ASSIGNED ? [UserRole.PROVIDER] : [UserRole.USER];
    const result = buildNotificationEmail(notification(type, entityType, roles), config);
    expect(result.subject).not.toContain('\n');
    expect(result.html).toContain('SmartClinic Network');
    expect(result.text).toContain('SmartClinic Network');
    expect(result.html).not.toContain('clinical notes');
    expect(result.text).not.toContain('clinical notes');
    expect(result.html).not.toContain('provider-secret');
  });

  it('uses patient and provider CTA routes from portable notification data', () => {
    expect(buildNotificationEmail(notification(NotificationType.CARE_REQUEST_ACCEPTED), config).text)
      .toContain('https://smartclinicnetwork.com/me/care/SC-CARE-1');
    expect(buildNotificationEmail(notification(NotificationType.CARE_REQUEST_ASSIGNED, NotificationEntityType.CARE_REQUEST, [UserRole.PROVIDER]), config).text)
      .toContain('https://smartclinicnetwork.com/provider/care-requests/SC-CARE-1');
    expect(buildNotificationEmail(notification(NotificationType.CARE_APPOINTMENT_CANCELLED, NotificationEntityType.CARE_APPOINTMENT, [UserRole.PROVIDER]), config).text)
      .toContain('https://smartclinicnetwork.com/provider/care-appointments/SC-APT-1');
    expect(buildNotificationEmail(notification(NotificationType.PROVIDER_APPROVED, NotificationEntityType.PROVIDER_PROFILE, [UserRole.PROVIDER]), config).text)
      .toContain('https://smartclinicnetwork.com/provider/profile');
  });
});
