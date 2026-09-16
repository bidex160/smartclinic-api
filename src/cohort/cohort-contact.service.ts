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
import { renderTransactionalEmail, sanitizeEmailSubject } from '../notifications/email/transactional-email-renderer';
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
        subject: sanitizeEmailSubject(`[SmartClinic Contact] ${contact.subject}`),
        text: this.buildText(contact),
        html: this.buildHtml(contact),
        idempotencyKey: `cohort-contact:${contact.id}`,
        cc: dto.email || ''
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
    return this.render(contact).text;
  }

  private buildHtml(contact: CohortContactSubmission): string {
    return this.render(contact).html;
  }

  private render(contact: CohortContactSubmission) {
    return renderTransactionalEmail({
      preheader: 'New SmartClinic contact enquiry.',
      title: 'New SmartClinic contact enquiry',
      body: ['A new contact enquiry was submitted.', `Message:\n${contact.message}`],
      details: [
        { label: 'Name', value: contact.name },
        { label: 'Email', value: contact.email },
        { label: 'Phone', value: contact.phone ?? 'Not provided' },
        { label: 'Organisation', value: contact.organisation ?? 'Not provided' },
        { label: 'Subject', value: contact.subject },
      ],
    }, { logoUrl: this.config.email.logoUrl });
  }
}
