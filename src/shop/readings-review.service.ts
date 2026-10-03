import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CheckupsService } from '../checkups/checkups.service';
import { VitalReading } from '../checkups/checkup.entities';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient } from '../patients/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { CheckupReviewRequest, ShopOrder } from './shop.entities';

/** Home readings needed (after the kit arrives) before the free doctor review. */
export const READINGS_FOR_REVIEW = 5;

/**
 * The free doctor review that comes with a Home Heart Kit: once there are a few days of readings,
 * the patient asks, a SmartClinic clinician looks at the readings and writes back.
 */
@Injectable()
export class ReadingsReviewService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CheckupReviewRequest) private readonly requests: Repository<CheckupReviewRequest>,
    @InjectRepository(ShopOrder) private readonly orders: Repository<ShopOrder>,
    @InjectRepository(VitalReading) private readonly readings: Repository<VitalReading>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly checkups: CheckupsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async mine(user: User) {
    const patient = await this.checkups.patientFor(user);
    const order = await this.orders.findOne({ where: { userId: user.id, includesReview: true, status: 'DELIVERED' }, order: { deliveredAt: 'ASC' } });
    const request = await this.requests.findOne({ where: { patientId: patient.id }, order: { createdAt: 'DESC' } });
    const since = order?.deliveredAt ?? null;
    const count = since
      ? await this.readings.createQueryBuilder('r').where('r.patientId = :p AND r.source = :s AND r.measuredAt >= :since AND r.systolic IS NOT NULL', { p: patient.id, s: 'HOME', since }).getCount()
      : 0;
    return {
      hasKit: Boolean(order),
      readings: count,
      needed: READINGS_FOR_REVIEW,
      canRequest: Boolean(order) && count >= READINGS_FOR_REVIEW && !request,
      request: request ? { status: request.status, createdAt: request.createdAt, answer: request.answer, answeredAt: request.answeredAt } : null,
    };
  }

  async request(user: User, note?: string | null) {
    const state = await this.mine(user);
    if (!state.hasKit) throw new ForbiddenException('The free review comes with a Home Heart Kit');
    if (state.request) throw new ConflictException('You’ve already asked for your free review');
    if (state.readings < READINGS_FOR_REVIEW) throw new BadRequestException(`Add ${READINGS_FOR_REVIEW - state.readings} more blood pressure readings first`);
    const patient = await this.checkups.patientFor(user);
    const order = await this.orders.findOne({ where: { userId: user.id, includesReview: true, status: 'DELIVERED' }, order: { deliveredAt: 'ASC' } });
    await this.requests.save(this.requests.create({ patientId: patient.id, orderId: order?.id ?? null, status: 'REQUESTED', patientNote: note?.trim().slice(0, 500) || null, answer: null, answeredByUserId: null, answeredAt: null }));
    return this.mine(user);
  }

  /** Staff queue: oldest first, with the readings to look at. */
  async queue() {
    const rows = await this.requests.find({ where: { status: 'REQUESTED' }, order: { createdAt: 'ASC' }, take: 100 });
    const out = [];
    for (const r of rows) {
      const p = await this.patients.findOne({ where: { id: r.patientId } });
      const readings = await this.readings.find({ where: { patientId: r.patientId }, order: { measuredAt: 'DESC' }, take: 21 });
      out.push({
        id: r.id, createdAt: r.createdAt, patientNote: r.patientNote,
        patient: p ? { reference: p.patientReference, firstName: p.givenName, dateOfBirth: p.dateOfBirth } : null,
        readings: readings.map((x) => this.checkups.readingView(x)),
      });
    }
    return { items: out };
  }

  async answer(user: User, id: string, answer: string) {
    const text = String(answer ?? '').trim();
    if (text.length < 10) throw new BadRequestException('Write a short note for the patient');
    const r = await this.requests.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Not found');
    if (r.status === 'ANSWERED') throw new ConflictException('Already answered');
    await this.requests.update({ id }, { status: 'ANSWERED', answer: text.slice(0, 2000), answeredByUserId: user.id, answeredAt: new Date() });
    const p = await this.patients.findOne({ where: { id: r.patientId } });
    if (p?.userId && this.notifications) {
      await this.dataSource.transaction((m) => this.notifications!.createTransactionalNotification(m, {
        userId: p.userId!, type: NotificationType.FREE_CHECK_DONE, title: 'Your readings have been reviewed', message: 'A SmartClinic clinician has looked at your home readings. Open SmartClinic to read their note.',
        entityType: NotificationEntityType.WELLNESS, entityReference: p.patientReference, metadata: { route: '/me/checkup', kind: 'readingsReviewed' },
        idempotencyKey: `readings-review:${id}`, email: { enabled: true },
      }));
    }
    return { answered: true };
  }
}
