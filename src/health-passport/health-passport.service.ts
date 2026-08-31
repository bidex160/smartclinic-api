import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { CareAppointmentStatus } from '../care-appointments/enums/care-appointment-status.enum';
import { ClinicalOrder } from '../clinical-orders/entities/clinical-order.entity';
import { PharmacyDispensing } from '../clinical-orders/entities/pharmacy-dispensing.entity';
import { ClinicalOrderStatus } from '../clinical-orders/enums/clinical-order-status.enum';
import { PharmacyDispensingStatus } from '../clinical-orders/enums/pharmacy-quote-status.enum';
import { ClinicalRecord } from '../clinical-records/entities/clinical-record.entity';
import { ClinicalRecordStatus } from '../clinical-records/enums/clinical-record-status.enum';
import { GuidedSelfCheckAnswer } from '../guided-self-checks/entities/guided-self-check-answer.entity';
import { GuidedSelfCheckClassificationResult } from '../guided-self-checks/entities/guided-self-check-classification.entity';
import { GuidedSelfCheckNextAction } from '../guided-self-checks/entities/guided-self-check-next-action.entity';
import { GuidedSelfCheckProfessionalReview } from '../guided-self-checks/entities/guided-self-check-professional-review.entity';
import { GuidedSelfCheck } from '../guided-self-checks/entities/guided-self-check.entity';
import { GuidedSelfCheckClassificationStatus } from '../guided-self-checks/enums/guided-self-check-classification.enum';
import { GuidedSelfCheckAnswerState } from '../guided-self-checks/enums/guided-self-check-questionnaire.enum';
import { GuidedSelfCheckWorkflowStatus } from '../guided-self-checks/enums/guided-self-check.enum';
import { GuidedSelfCheckNextActionsService } from '../guided-self-checks/guided-self-check-next-actions.service';
import { HealthCheckEncounter } from '../health-checks/entities/health-check-encounter.entity';
import { HealthCheckMeasurement } from '../health-checks/entities/health-check-measurement.entity';
import { HealthCheckEncounterStatus } from '../health-checks/enums/health-check-encounter-status.enum';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { HealthPassportTimelineQueryDto } from './dto/health-passport-query.dto';

export enum HealthPassportProvenance {
  REPORTED_BY_YOU = 'REPORTED_BY_YOU',
  CHECKED_BY_PROVIDER = 'CHECKED_BY_PROVIDER',
  CONFIRMED_BY_LABORATORY = 'CONFIRMED_BY_LABORATORY',
}

export enum HealthPassportTimelineType {
  SELF_CHECK_COMPLETED = 'SELF_CHECK_COMPLETED',
  HEALTH_CHECK_COMPLETED = 'HEALTH_CHECK_COMPLETED',
  GENERAL_CARE_COMPLETED = 'GENERAL_CARE_COMPLETED',
  CLINICAL_RECORD_FINALIZED = 'CLINICAL_RECORD_FINALIZED',
  PRESCRIPTION_ISSUED = 'PRESCRIPTION_ISSUED',
  MEDICATION_DISPENSED = 'MEDICATION_DISPENSED',
}

type TimelineItem = {
  eventKey: string;
  type: HealthPassportTimelineType;
  occurredAt: Date;
  title: string;
  description: string;
  sourceDomain: string;
  sourceReference: string;
  provenance?: HealthPassportProvenance;
  context?: Record<string, unknown>;
};

type PassportMeasurement = {
  type: string;
  value: Record<string, unknown>;
  unit: string;
  recordedAt: Date;
  provenance: HealthPassportProvenance;
  sourceDomain: string;
  sourceReference: string;
  provider?: { providerReference: string; displayName: string };
};

@Injectable()
export class HealthPassportService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(GuidedSelfCheck) private readonly selfChecks: Repository<GuidedSelfCheck>,
    @InjectRepository(GuidedSelfCheckAnswer) private readonly answers: Repository<GuidedSelfCheckAnswer>,
    @InjectRepository(GuidedSelfCheckClassificationResult) private readonly classifications: Repository<GuidedSelfCheckClassificationResult>,
    @InjectRepository(GuidedSelfCheckProfessionalReview) private readonly reviews: Repository<GuidedSelfCheckProfessionalReview>,
    @InjectRepository(GuidedSelfCheckNextAction) private readonly actions: Repository<GuidedSelfCheckNextAction>,
    @InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>,
    @InjectRepository(HealthCheckMeasurement) private readonly healthMeasurements: Repository<HealthCheckMeasurement>,
    @InjectRepository(CareAppointment) private readonly appointments: Repository<CareAppointment>,
    @InjectRepository(ClinicalRecord) private readonly records: Repository<ClinicalRecord>,
    @InjectRepository(ClinicalOrder) private readonly orders: Repository<ClinicalOrder>,
    @InjectRepository(PharmacyDispensing) private readonly dispensings: Repository<PharmacyDispensing>,
    private readonly nextActions: GuidedSelfCheckNextActionsService,
  ) {}

  private async patient(userId: string) {
    const patient = await this.patients.findOne({
      where: { userId, status: PatientStatus.ACTIVE },
    });
    if (!patient || patient.deletedAt) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  async overview(userId: string) {
    const patient = await this.patient(userId);
    const [summary, latestMeasurements, recentChecks, currentNextAction, reportedHealthHistory, recentActivity] = await Promise.all([
      this.summary(patient.id),
      this.measurements(patient.id),
      this.recentChecks(patient.id),
      this.currentNextAction(patient.id),
      this.reportedHistory(patient.id),
      this.timelineForPatient(patient.id, { page: 1, limit: 5 }),
    ]);
    return {
      patient: {
        patientReference: patient.patientReference,
        givenName: patient.givenName,
        familyName: patient.familyName,
        displayName: `${patient.givenName} ${patient.familyName}`.trim(),
        dateOfBirth: patient.dateOfBirth,
      },
      summary,
      latestMeasurements,
      reportedHealthHistory,
      recentChecks,
      recentMedicationContext: await this.recentPrescriptions(patient.id, 3),
      currentNextAction,
      recentActivity: recentActivity.items,
    };
  }

  async timeline(userId: string, query: HealthPassportTimelineQueryDto) {
    return this.timelineForPatient((await this.patient(userId)).id, query);
  }

  private async summary(patientId: string) {
    const [completedSelfChecks, completedHealthChecks, completedGeneralCareEncounters, finalizedClinicalRecords, issuedPrescriptions, completedDispensings] = await Promise.all([
      this.selfChecks.countBy({ patientId, workflowStatus: GuidedSelfCheckWorkflowStatus.COMPLETED }),
      this.encounters.createQueryBuilder('e').innerJoin('e.booking', 'b').where('b.participantPatientId=:patientId', { patientId }).andWhere('e.status=:status', { status: HealthCheckEncounterStatus.COMPLETED }).getCount(),
      this.appointments.countBy({ patientId, status: CareAppointmentStatus.COMPLETED }),
      this.records.countBy({ patientId, status: ClinicalRecordStatus.FINALIZED }),
      this.orders.countBy({ patientId, status: ClinicalOrderStatus.ISSUED }),
      this.dispensings.createQueryBuilder('d').innerJoin('d.fulfillment', 'f').where('f.patientId=:patientId', { patientId }).andWhere('d.status=:status', { status: PharmacyDispensingStatus.COMPLETED }).getCount(),
    ]);
    return { completedSelfChecks, completedHealthChecks, completedGeneralCareEncounters, finalizedClinicalRecords, issuedPrescriptions, completedDispensings };
  }

  private async measurements(patientId: string) {
    const [reported, checked] = await Promise.all([this.reportedMeasurements(patientId), this.providerMeasurements(patientId)]);
    const latest = new Map<string, PassportMeasurement>();
    for (const item of [...reported, ...checked].sort((a, b) => +new Date(b.recordedAt) - +new Date(a.recordedAt))) {
      const key = `${item.type}:${item.provenance}`;
      if (!latest.has(key)) latest.set(key, item);
    }
    return [...latest.values()].sort((a, b) => +new Date(b.recordedAt) - +new Date(a.recordedAt));
  }

  private async reportedMeasurements(patientId: string) {
    const rows = await this.answers.createQueryBuilder('answer')
      .innerJoinAndSelect('answer.question', 'question')
      .innerJoinAndSelect('answer.selfCheck', 'selfCheck')
      .where('selfCheck.patientId=:patientId', { patientId })
      .andWhere('selfCheck.workflowStatus=:completed', { completed: GuidedSelfCheckWorkflowStatus.COMPLETED })
      .andWhere('answer.state=:known', { known: GuidedSelfCheckAnswerState.KNOWN })
      .andWhere('question.key IN (:...keys)', { keys: ['last_known_blood_pressure', 'last_known_blood_sugar'] })
      .orderBy('answer.updatedAt', 'DESC').getMany();
    return rows.map((row) => {
      const glucose = row.question.key === 'last_known_blood_sugar';
      const value = row.value as Record<string, unknown>;
      return {
        type: glucose ? 'BLOOD_GLUCOSE' : 'BLOOD_PRESSURE',
        value: glucose ? { value: value.value } : { systolic: value.systolic, diastolic: value.diastolic },
        unit: String(value.unit ?? (glucose ? '' : 'mmHg')),
        recordedAt: row.updatedAt,
        provenance: HealthPassportProvenance.REPORTED_BY_YOU,
        sourceDomain: 'GUIDED_SELF_CHECK', sourceReference: row.selfCheck.reference,
      };
    });
  }

  private async providerMeasurements(patientId: string) {
    const rows = await this.healthMeasurements.createQueryBuilder('measurement')
      .innerJoinAndSelect('measurement.encounter', 'encounter')
      .innerJoinAndSelect('encounter.booking', 'booking')
      .innerJoinAndSelect('encounter.provider', 'provider')
      .where('booking.participantPatientId=:patientId', { patientId })
      .andWhere('encounter.status=:completed', { completed: HealthCheckEncounterStatus.COMPLETED })
      .orderBy('measurement.recordedAt', 'DESC').getMany();
    return rows.map((row) => ({
      type: row.code,
      value: row.valueSecondaryNumeric === null ? { value: row.valueNumeric } : { primary: row.valueNumeric, secondary: row.valueSecondaryNumeric },
      unit: row.unit,
      recordedAt: row.recordedAt,
      provenance: HealthPassportProvenance.CHECKED_BY_PROVIDER,
      sourceDomain: 'HEALTH_CHECK', sourceReference: row.encounter.booking.bookingReference,
      provider: { providerReference: row.encounter.provider.providerReference, displayName: row.encounter.provider.displayName },
    }));
  }

  private async reportedHistory(patientId: string) {
    const latest = await this.selfChecks.findOne({ where: { patientId, workflowStatus: GuidedSelfCheckWorkflowStatus.COMPLETED }, order: { completedAt: 'DESC' } });
    if (!latest) return [];
    const rows = await this.answers.createQueryBuilder('answer').innerJoinAndSelect('answer.question', 'question')
      .where('answer.guidedSelfCheckId=:id', { id: latest.id })
      .andWhere('question.key IN (:...keys)', { keys: ['existing_conditions', 'family_history', 'medication_details', 'allergy_details'] })
      .orderBy('question.sortOrder', 'ASC').getMany();
    return rows.map((row) => ({ key: row.question.key, label: row.question.text, answerState: row.state, value: row.value, provenance: HealthPassportProvenance.REPORTED_BY_YOU, sourceReference: latest.reference, reportedAt: row.updatedAt }));
  }

  private async currentNextAction(patientId: string) {
    const row = await this.actions.createQueryBuilder('action').innerJoinAndSelect('action.selfCheck', 'selfCheck')
      .where('selfCheck.patientId=:patientId', { patientId }).andWhere('selfCheck.workflowStatus=:completed', { completed: GuidedSelfCheckWorkflowStatus.COMPLETED })
      .andWhere('action.isCurrent=true').orderBy('action.selectedAt', 'DESC').addOrderBy('action.id', 'DESC').getOne();
    return row ? this.nextActions.project(row) : null;
  }

  private async recentChecks(patientId: string) {
    const [selfChecks, healthChecks] = await Promise.all([
      this.selfChecks.find({ where: { patientId, workflowStatus: GuidedSelfCheckWorkflowStatus.COMPLETED }, order: { completedAt: 'DESC' }, take: 3 }),
      this.encounters.createQueryBuilder('e').innerJoinAndSelect('e.booking', 'b').innerJoinAndSelect('b.healthCheckPackage', 'package').innerJoinAndSelect('b.fulfilmentMode', 'mode').innerJoinAndSelect('e.provider', 'provider')
        .where('b.participantPatientId=:patientId', { patientId }).andWhere('e.status=:completed', { completed: HealthCheckEncounterStatus.COMPLETED }).orderBy('e.completedAt', 'DESC').take(3).getMany(),
    ]);
    const ids = selfChecks.map((x) => x.id);
    const [classifications, reviews] = ids.length ? await Promise.all([
      this.classifications.find({ where: { guidedSelfCheckId: In(ids) } }), this.reviews.find({ where: { guidedSelfCheckId: In(ids) } }),
    ]) : [[], []];
    return {
      selfChecks: selfChecks.map((x) => {
        const classification = classifications.find((c) => c.guidedSelfCheckId === x.id);
        const review = reviews.find((r) => r.guidedSelfCheckId === x.id);
        return { reference: x.reference, completedAt: x.completedAt, classificationStatus: x.classificationStatus, classification: classification?.classification ?? null, patientMessageKey: classification?.patientMessageKey ?? null, professionalReview: review ? { required: true, status: review.status, completedAt: review.completedAt } : { required: false, status: null, completedAt: null } };
      }),
      healthChecks: healthChecks.map((x) => ({ reference: x.booking.bookingReference, package: { code: x.booking.healthCheckPackage.code, name: x.booking.healthCheckPackage.name }, completedAt: x.completedAt, provider: { providerReference: x.provider.providerReference, displayName: x.provider.displayName }, fulfilmentMode: { code: x.booking.fulfilmentMode.code, name: x.booking.fulfilmentMode.name } })),
    };
  }

  private async recentPrescriptions(patientId: string, take: number) {
    const rows = await this.orders.find({ where: { patientId, status: ClinicalOrderStatus.ISSUED }, relations: { orderingProvider: true, prescription: { items: true } }, order: { issuedAt: 'DESC' }, take });
    return rows.map((x) => ({ orderReference: x.reference, issuedAt: x.issuedAt, context: 'PRESCRIBED', provider: { providerReference: x.orderingProvider.providerReference, displayName: x.orderingProvider.displayName }, medicines: (x.prescription?.items ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ name: i.medicationName, strength: i.strength, dosage: i.dosage, frequency: i.frequency, duration: i.duration })) }));
  }

  private async timelineForPatient(patientId: string, query: HealthPassportTimelineQueryDto) {
    const take = query.page * query.limit;
    const sources = await Promise.all([
      this.selfCheckEvents(patientId, take), this.healthCheckEvents(patientId, take), this.careEvents(patientId, take),
      this.recordEvents(patientId, take), this.prescriptionEvents(patientId, take), this.dispensingEvents(patientId, take),
    ]);
    const all = sources.flat().sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt) || b.eventKey.localeCompare(a.eventKey));
    const total = await this.timelineTotal(patientId);
    const offset = (query.page - 1) * query.limit;
    return { items: all.slice(offset, offset + query.limit), page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 };
  }

  private async timelineTotal(patientId: string) {
    const summary = await this.summary(patientId);
    return summary.completedSelfChecks + summary.completedHealthChecks + summary.completedGeneralCareEncounters + summary.finalizedClinicalRecords + summary.issuedPrescriptions + summary.completedDispensings;
  }

  private async selfCheckEvents(patientId: string, take: number): Promise<TimelineItem[]> {
    const rows = await this.selfChecks.find({ where: { patientId, workflowStatus: GuidedSelfCheckWorkflowStatus.COMPLETED }, order: { completedAt: 'DESC', reference: 'DESC' }, take });
    const ids = rows.map((x) => x.id);
    const [classifications, reviews, actions] = ids.length ? await Promise.all([
      this.classifications.find({ where: { guidedSelfCheckId: In(ids) } }),
      this.reviews.find({ where: { guidedSelfCheckId: In(ids) } }),
      this.actions.find({ where: { guidedSelfCheckId: In(ids), isCurrent: true } }),
    ]) : [[], [], []];
    return rows.map((x) => {
      const classification = classifications.find((c) => c.guidedSelfCheckId === x.id);
      const review = reviews.find((r) => r.guidedSelfCheckId === x.id);
      const action = actions.find((a) => a.guidedSelfCheckId === x.id);
      return { eventKey: `${HealthPassportTimelineType.SELF_CHECK_COMPLETED}:${x.reference}`, type: HealthPassportTimelineType.SELF_CHECK_COMPLETED, occurredAt: x.completedAt!, title: 'Guided Self-Check completed', description: x.classificationStatus === GuidedSelfCheckClassificationStatus.CONFIGURATION_REQUIRED ? 'Your Guided Self-Check was received and is awaiting clinical processing.' : 'Your Guided Self-Check questionnaire was completed.', sourceDomain: 'GUIDED_SELF_CHECK', sourceReference: x.reference, provenance: HealthPassportProvenance.REPORTED_BY_YOU, context: { classificationStatus: x.classificationStatus, classification: classification?.classification ?? null, patientMessageKey: classification?.patientMessageKey ?? null, professionalReview: review ? { required: true, status: review.status, completedAt: review.completedAt } : { required: false, status: null, completedAt: null }, nextAction: action ? this.nextActions.project(action) : null } };
    });
  }

  private async healthCheckEvents(patientId: string, take: number): Promise<TimelineItem[]> {
    const rows = await this.encounters.createQueryBuilder('e').innerJoinAndSelect('e.booking', 'b').innerJoinAndSelect('b.healthCheckPackage', 'package').innerJoinAndSelect('e.provider', 'provider').where('b.participantPatientId=:patientId', { patientId }).andWhere('e.status=:completed', { completed: HealthCheckEncounterStatus.COMPLETED }).orderBy('e.completedAt', 'DESC').addOrderBy('b.bookingReference', 'DESC').take(take).getMany();
    return rows.map((x) => ({ eventKey: `${HealthPassportTimelineType.HEALTH_CHECK_COMPLETED}:${x.booking.bookingReference}`, type: HealthPassportTimelineType.HEALTH_CHECK_COMPLETED, occurredAt: x.completedAt!, title: `${x.booking.healthCheckPackage.name} completed`, description: 'Health Check completed.', sourceDomain: 'HEALTH_CHECK', sourceReference: x.booking.bookingReference, provenance: HealthPassportProvenance.CHECKED_BY_PROVIDER, context: { packageCode: x.booking.healthCheckPackage.code, provider: { providerReference: x.provider.providerReference, displayName: x.provider.displayName } } }));
  }

  private async careEvents(patientId: string, take: number): Promise<TimelineItem[]> {
    const rows = await this.appointments.find({ where: { patientId, status: CareAppointmentStatus.COMPLETED }, relations: { provider: true, providerCareService: { definition: true } }, order: { updatedAt: 'DESC', reference: 'DESC' }, take });
    return rows.map((x) => ({ eventKey: `${HealthPassportTimelineType.GENERAL_CARE_COMPLETED}:${x.reference}`, type: HealthPassportTimelineType.GENERAL_CARE_COMPLETED, occurredAt: x.updatedAt, title: 'General Care completed', description: `${x.providerCareService.definition.name} completed.`, sourceDomain: 'GENERAL_CARE', sourceReference: x.reference, provenance: HealthPassportProvenance.CHECKED_BY_PROVIDER, context: { service: { code: x.providerCareService.definition.code, name: x.providerCareService.definition.name }, provider: { providerReference: x.provider.providerReference, displayName: x.provider.displayName } } }));
  }

  private async recordEvents(patientId: string, take: number): Promise<TimelineItem[]> {
    const rows = await this.records.find({ where: { patientId, status: ClinicalRecordStatus.FINALIZED }, relations: { provider: true }, order: { occurredAt: 'DESC', reference: 'DESC' }, take });
    return rows.map((x) => ({ eventKey: `${HealthPassportTimelineType.CLINICAL_RECORD_FINALIZED}:${x.reference}`, type: HealthPassportTimelineType.CLINICAL_RECORD_FINALIZED, occurredAt: x.finalizedAt ?? x.occurredAt, title: x.title, description: 'Clinical Record finalized.', sourceDomain: 'CLINICAL_RECORD', sourceReference: x.reference, provenance: HealthPassportProvenance.CHECKED_BY_PROVIDER, context: { recordType: x.recordType, provider: { providerReference: x.provider.providerReference, displayName: x.provider.displayName } } }));
  }

  private async prescriptionEvents(patientId: string, take: number): Promise<TimelineItem[]> {
    const rows = await this.orders.find({ where: { patientId, status: ClinicalOrderStatus.ISSUED }, relations: { orderingProvider: true, prescription: { items: true } }, order: { issuedAt: 'DESC', reference: 'DESC' }, take });
    return rows.map((x) => ({ eventKey: `${HealthPassportTimelineType.PRESCRIPTION_ISSUED}:${x.reference}`, type: HealthPassportTimelineType.PRESCRIPTION_ISSUED, occurredAt: x.issuedAt!, title: 'Prescription issued', description: 'A prescription was issued.', sourceDomain: 'CLINICAL_ORDER', sourceReference: x.reference, provenance: HealthPassportProvenance.CHECKED_BY_PROVIDER, context: { provider: { providerReference: x.orderingProvider.providerReference, displayName: x.orderingProvider.displayName }, medicines: (x.prescription?.items ?? []).map((i) => ({ name: i.medicationName, strength: i.strength })) } }));
  }

  private async dispensingEvents(patientId: string, take: number): Promise<TimelineItem[]> {
    const rows = await this.dispensings.createQueryBuilder('d').innerJoinAndSelect('d.fulfillment', 'f').innerJoinAndSelect('f.fulfillmentProvider', 'provider').innerJoinAndSelect('f.clinicalOrder', 'order').innerJoinAndSelect('order.prescription', 'prescription').leftJoinAndSelect('prescription.items', 'items').where('f.patientId=:patientId', { patientId }).andWhere('d.status=:completed', { completed: PharmacyDispensingStatus.COMPLETED }).orderBy('d.completedAt', 'DESC').addOrderBy('f.reference', 'DESC').take(take).getMany();
    return rows.map((x) => ({ eventKey: `${HealthPassportTimelineType.MEDICATION_DISPENSED}:${x.fulfillment.reference}`, type: HealthPassportTimelineType.MEDICATION_DISPENSED, occurredAt: x.completedAt!, title: 'Medication dispensed', description: 'Prescription medication dispensing was completed.', sourceDomain: 'PHARMACY_FULFILLMENT', sourceReference: x.fulfillment.reference, provenance: HealthPassportProvenance.CHECKED_BY_PROVIDER, context: { prescriptionReference: x.fulfillment.clinicalOrder.reference, pharmacy: { providerReference: x.fulfillment.fulfillmentProvider.providerReference, displayName: x.fulfillment.fulfillmentProvider.displayName }, medicines: (x.fulfillment.clinicalOrder.prescription?.items ?? []).map((i) => ({ name: i.medicationName, strength: i.strength })) } }));
  }
}
