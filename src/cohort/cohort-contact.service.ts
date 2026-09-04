import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigType } from '@nestjs/config';
import { Repository } from 'typeorm';

import { appConfig } from '../config/app.config';
import {
  EMAIL_PROVIDER,
  EmailProvider,
  EmailSendOutcome,
} from '../notifications/email/email-provider';
import {  CohortContactSubmissionStatus, CohortContactSubmission } from './entities/cohort-contact-submission.entity';
import { CohortContactSubmissionDto } from './dto/cohort-contact-submission.dto';


@Injectable()
export class CohortContactService {
  private readonly logger = new Logger(CohortContactService.name);

  constructor(
    @InjectRepository(CohortContactSubmission)
    private readonly contacts: Repository<CohortContactSubmission>,

    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,

    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
  ) {}

  async submit(dto: CohortContactSubmissionDto) {
    const contact = await this.contacts.save(
      this.contacts.create({
        name: dto.name,
        email: dto.email,
        phone: dto.phone || null,
        organisation: dto.organisation || null,
        subject: dto.subject,
        message: dto.message,
        status: CohortContactSubmissionStatus.NEW,
        emailNotificationSent: false,
      }),
    );

    try {
      const delivery = await this.emailProvider.sendTransactionalEmail({
        to: this.config.email.contactToAddress,
        fromAddress: this.config.email.fromAddress,
        fromName: this.config.email.fromName,
        subject: `[SmartClinic Contact] ${contact.subject}`,
        text: this.buildText(contact),
        html: this.buildHtml(contact),
        idempotencyKey: `cohort-contact:${contact.id}`,
      });

      if (delivery.outcome === EmailSendOutcome.SENT) {
        contact.emailNotificationSent = true;
        await this.contacts.save(contact);
      }
    } catch {
      // Do not lose the enquiry just because email notification failed.
      this.logger.warn(
        `Contact notification email failed for submission ${contact.id}`,
      );
    }

    return {
      message:
        'Thanks for contacting SmartClinic. We’ll get back to you shortly.',
    };
  }

  private buildText(contact: CohortContactSubmission): string {
    return [
      'New SmartClinic contact enquiry',
      '',
      `Name: ${contact.name}`,
      `Email: ${contact.email}`,
      `Phone: ${contact.phone ?? 'Not provided'}`,
      `Organisation: ${contact.organisation ?? 'Not provided'}`,
      `Subject: ${contact.subject}`,
      '',
      'Message:',
      contact.message,
    ].join('\n');
  }

  private buildHtml(contact: CohortContactSubmission): string {
    const message = this.escapeHtml(contact.message).replace(/\n/g, '<br>');

    return `
      <h1>New SmartClinic contact enquiry</h1>

      <p><strong>Name:</strong> ${this.escapeHtml(contact.name)}</p>
      <p><strong>Email:</strong> ${this.escapeHtml(contact.email)}</p>
      <p><strong>Phone:</strong> ${this.escapeHtml(contact.phone ?? 'Not provided')}</p>
      <p><strong>Organisation:</strong> ${this.escapeHtml(contact.organisation ?? 'Not provided')}</p>
      <p><strong>Subject:</strong> ${this.escapeHtml(contact.subject)}</p>

      <h2>Message</h2>
      <p>${message}</p>
    `;
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    );
  }
}