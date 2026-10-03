import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { RateBudget } from '../companion/companion.controller';
import { CareAppointmentsService } from '../care-appointments/care-appointments.service';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestsService } from '../care-requests/care-requests.service';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { cleanAnswers, evaluate, questionnaire } from './intake.engine';
import { SymptomIntake } from './intake.entity';

export const INTAKE_CONTENT_VERSION = 1;
/** An intake can be attached to a care request for this long after it was answered. */
const ATTACH_WINDOW_MS = 48 * 3600_000;

@Injectable()
export class IntakeService {
  private readonly budget = new RateBudget(20, 60 * 60_000);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SymptomIntake) private readonly intakes: Repository<SymptomIntake>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly careRequests: CareRequestsService,
    private readonly appointments: CareAppointmentsService,
  ) {}

  questions() {
    return { version: INTAKE_CONTENT_VERSION, ...questionnaire() };
  }

  /** Save the answers and tell the patient how soon to get care (never what it might be). */
  async submit(user: User, raw: Record<string, unknown>) {
    if (!this.budget.take(user.id)) throw new HttpException('Too many tries. Please wait a little and try again.', HttpStatus.TOO_MANY_REQUESTS);
    const answers = cleanAnswers(raw);
    if (!(answers['complaints'] as string[]).length) throw new ConflictException('Pick at least one problem');
    const result = evaluate(answers);
    const self = answers['who'] === undefined || answers['who'] === 'ME';
    const patient = self ? await this.patients.findOne({ where: { userId: user.id, status: PatientStatus.ACTIVE } }) : null;
    const row = await this.intakes.save(this.intakes.create({
      userId: user.id, patientId: patient?.id ?? null, careRequestId: null, answers,
      urgency: result.urgency, redFlags: result.redFlags, considerations: result.considerations, summary: result.summary,
      contentVersion: INTAKE_CONTENT_VERSION,
    }));
    return this.patientView(row);
  }

  async mine(user: User, id: string) {
    const row = await this.intakes.findOne({ where: { id, userId: user.id } });
    if (!row) throw new NotFoundException('Not found');
    return this.patientView(row);
  }

  /** Link the answers to the care request they were for, so the doctor sees them. */
  async attach(user: User, id: string, careRequestReference: string) {
    return this.dataSource.transaction(async (m) => {
      const row = await m.getRepository(SymptomIntake).findOne({ where: { id, userId: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new NotFoundException('Not found');
      if (Date.now() - row.createdAt.getTime() > ATTACH_WINDOW_MS) throw new ConflictException('These answers are too old. Please answer again.');
      const request = await m.getRepository(CareRequest).findOne({ where: { reference: careRequestReference, userId: user.id } });
      if (!request) throw new NotFoundException('Care request not found');
      if (row.careRequestId && row.careRequestId !== request.id) throw new ConflictException('Already linked to another request');
      // One intake per request: the newest answers replace older ones.
      await m.getRepository(SymptomIntake).createQueryBuilder().update().set({ careRequestId: null })
        .where('care_request_id = :r AND id <> :id', { r: request.id, id }).execute();
      await m.getRepository(SymptomIntake).update({ id }, { careRequestId: request.id, patientId: request.patientId });
      return { attached: true, careRequestReference: request.reference };
    });
  }

  /** For the doctor on a care request they hold (access is checked by the care request service). */
  async forProviderRequest(user: User, careRequestReference: string) {
    await this.careRequests.getForProvider(user, careRequestReference);
    return { intake: await this.byRequestReference(careRequestReference) };
  }

  async forProviderAppointment(user: User, appointmentReference: string) {
    const appointment = (await this.appointments.getProvider(user, appointmentReference)) as { careRequestReference?: string };
    return { intake: appointment.careRequestReference ? await this.byRequestReference(appointment.careRequestReference) : null };
  }

  /** The doctor's view: no access check, callers must have done it. */
  async byRequestReference(reference: string) {
    const row = await this.intakes.createQueryBuilder('i')
      .innerJoin(CareRequest, 'r', 'r.id = i.careRequestId')
      .where('r.reference = :reference', { reference })
      .orderBy('i.createdAt', 'DESC')
      .getOne();
    return row ? this.doctorView(row) : null;
  }

  patientView(row: SymptomIntake) {
    return {
      id: row.id,
      urgency: row.urgency,
      redFlags: row.redFlags.map((f) => f.id),
      complaints: row.answers['complaints'] ?? [],
      createdAt: row.createdAt,
      attached: Boolean(row.careRequestId),
    };
  }

  doctorView(row: SymptomIntake) {
    return {
      id: row.id,
      createdAt: row.createdAt,
      urgency: row.urgency,
      summary: row.summary,
      redFlags: row.redFlags.map((f) => ({ id: f.id, label: f.label, urgency: f.urgency })),
      considerations: row.considerations.map((c) => ({ code: c.code, name: c.name, why: c.why, note: c.note, labs: c.labs, imaging: c.imaging, meds: c.meds })),
      contentVersion: row.contentVersion,
    };
  }
}
