import { AppConfiguration } from '../config/environment';
import { UserRole } from '../users/enums/user-role.enum';
import { Notification } from './entities/notification.entity';
import { NotificationEntityType } from './enums/notification-entity-type.enum';
import { NotificationType } from './enums/notification-type.enum';
import { joinUrl, renderTransactionalEmail, sanitizeEmailSubject } from './email/transactional-email-renderer';

interface NotificationContent {
  subject: string;
  preheader: string;
  title: string;
  body: string;
  ctaLabel?: string;
}

const CONTENT: Record<NotificationType, NotificationContent> = {
  [NotificationType.CARE_REQUEST_ASSIGNED]: {
    subject: 'New care request',
    preheader: 'A new care request is ready for your review.',
    title: 'New care request',
    body: 'A new care request has been assigned to you in SmartClinic Network.',
    ctaLabel: 'View care request',
  },
  [NotificationType.CARE_REQUEST_ACCEPTED]: {
    subject: 'Your care request was accepted',
    preheader: 'Your care provider has accepted your request.',
    title: 'Care request accepted',
    body: 'Your care provider has accepted your request. Sign in to SmartClinic Network to view the latest details.',
    ctaLabel: 'View care request',
  },
  [NotificationType.CARE_REQUEST_DECLINED]: {
    subject: 'Your care request was declined',
    preheader: 'The assigned provider declined your care request.',
    title: 'Care request declined',
    body: 'The assigned provider declined your care request. Sign in to SmartClinic Network to view the latest status.',
    ctaLabel: 'View care request',
  },
  [NotificationType.CARE_REQUEST_REASSIGNED]: {
    subject: 'Care request updated',
    preheader: 'Your care request assignment has been updated.',
    title: 'Care request updated',
    body: 'A care request assignment has been updated in SmartClinic Network.',
    ctaLabel: 'View care request',
  },
  [NotificationType.CARE_REQUEST_CANCELLED]: {
    subject: 'Care request cancelled',
    preheader: 'A care request was cancelled.',
    title: 'Care request cancelled',
    body: 'A care request was cancelled in SmartClinic Network.',
    ctaLabel: 'View care request',
  },
  [NotificationType.CARE_APPOINTMENT_SCHEDULED]: {
    subject: 'Care appointment scheduled',
    preheader: 'Your care appointment has been scheduled.',
    title: 'Care appointment scheduled',
    body: 'Your care appointment has been scheduled. Sign in to SmartClinic Network to view the latest details.',
    ctaLabel: 'View appointment',
  },
  [NotificationType.CARE_APPOINTMENT_CANCELLED]: {
    subject: 'Care appointment cancelled',
    preheader: 'A care appointment was cancelled.',
    title: 'Care appointment cancelled',
    body: 'A care appointment was cancelled in SmartClinic Network. Sign in to view the latest status.',
    ctaLabel: 'View appointment',
  },
  [NotificationType.PROVIDER_ONBOARDING_SUBMITTED]: {
    subject: 'Provider onboarding submitted',
    preheader: 'Your provider profile has been submitted for review.',
    title: 'Provider onboarding submitted',
    body: 'Your SmartClinic Network provider profile has been submitted for review.',
    ctaLabel: 'Review profile',
  },
  [NotificationType.PROVIDER_APPROVED]: {
    subject: 'Your SmartClinic provider account has been approved',
    preheader: 'Your SmartClinic Network provider account has been approved.',
    title: "You're approved",
    body: 'Your SmartClinic Network provider profile has been approved. Product-specific setup, services, and availability remain managed separately in your provider workspace.',
    ctaLabel: 'Go to provider profile',
  },
  [NotificationType.PROVIDER_REJECTED]: {
    subject: 'Your provider profile needs attention',
    preheader: 'Your provider profile requires changes before approval.',
    title: 'Your provider profile needs attention',
    body: 'Your SmartClinic Network provider profile requires changes before it can be approved. Sign in to review the latest status and next steps.',
    ctaLabel: 'Review profile',
  },
};

export function buildNotificationEmail(notification: Notification, config: AppConfiguration) {
  const content = CONTENT[notification.type] ?? {
    subject: notification.title,
    preheader: notification.title,
    title: notification.title,
    body: notification.message,
  };
  const actionUrl = content.ctaLabel ? notificationActionUrl(notification, config.frontendUrl) : null;
  const rendered = renderTransactionalEmail({
    preheader: content.preheader,
    title: content.title,
    body: content.body,
    action: actionUrl ? { label: content.ctaLabel!, url: actionUrl } : null,
    reference: notification.entityReference,
  }, { logoUrl: config.email.logoUrl });
  return { subject: sanitizeEmailSubject(content.subject), ...rendered };
}

function notificationActionUrl(notification: Notification, frontendUrl: string): string | null {
  const provider = notification.user?.roles?.includes(UserRole.PROVIDER);
  const reference = encodeURIComponent(notification.entityReference);
  if (provider) {
    switch (notification.entityType) {
      case NotificationEntityType.CARE_REQUEST:
        return joinUrl(frontendUrl, `/provider/care-requests/${reference}`);
      case NotificationEntityType.CARE_APPOINTMENT:
        return joinUrl(frontendUrl, `/provider/care-appointments/${reference}`);
      case NotificationEntityType.PROVIDER_PROFILE:
        return joinUrl(frontendUrl, '/provider/profile');
      default:
        return null;
    }
  }
  switch (notification.entityType) {
    case NotificationEntityType.CARE_REQUEST:
      return joinUrl(frontendUrl, `/me/care/${reference}`);
    case NotificationEntityType.CARE_APPOINTMENT:
      return joinUrl(frontendUrl, `/me/care/appointments/${reference}`);
    default:
      return null;
  }
}

