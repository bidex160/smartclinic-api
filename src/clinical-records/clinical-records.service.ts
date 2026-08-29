import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { CurrentProviderService } from '../providers/current-provider.service';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { User } from '../users/entities/user.entity';
import { generateClinicalRecordReference, isClinicalRecordReferenceCollision, MAX_CLINICAL_RECORD_REFERENCE_ATTEMPTS } from './clinical-record-reference';
import { ClinicalRecordListQueryDto, ClinicalConsultationDetailDto, CreateClinicalRecordDto, UpdateClinicalRecordDto } from './dto/clinical-record.dto';
import { ClinicalConsultationDetail } from './entities/clinical-consultation-detail.entity';
import { ClinicalRecord } from './entities/clinical-record.entity';
import { ClinicalRecordStatus } from './enums/clinical-record-status.enum';
import { ClinicalRecordType } from './enums/clinical-record-type.enum';

@Injectable()
export class ClinicalRecordsService {
  constructor(
    @InjectRepository(ClinicalRecord) private readonly records: Repository<ClinicalRecord>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly currentProvider: CurrentProviderService,
  ) {}

  async createForAppointment(user: User, appointmentReference: string, dto: CreateClinicalRecordDto) {
    const provider = await this.currentProvider.resolveOperational(user);
    this.validateTypedDetail(dto.recordType, dto.consultation);
    for (let attempt = 0; attempt < MAX_CLINICAL_RECORD_REFERENCE_ATTEMPTS; attempt += 1) {
      try {
        return await this.records.manager.transaction(async (manager) => {
          const appointment = await this.ownedAppointment(manager, appointmentReference, provider.id, 'pessimistic_write');
          if (await manager.getRepository(ClinicalRecord).exists({ where: { careAppointmentId: appointment.id } })) throw new ConflictException('Care Appointment already has a clinical record');
          const record = await this.createDraft(manager, appointment, appointment.careRequest, dto.recordType, dto.title, dto.summary ?? null, user.id, dto.consultation ?? {});
          return this.getMapped(manager, record.id);
        });
      } catch (error) {
        if (isClinicalRecordReferenceCollision(error) && attempt + 1 < MAX_CLINICAL_RECORD_REFERENCE_ATTEMPTS) continue;
        if (this.constraint(error) === 'UQ_clinical_records_care_appointment') throw new ConflictException('Care Appointment already has a clinical record');
        throw error;
      }
    }
    throw new ConflictException('Unable to allocate a Clinical Record reference');
  }

  async ensureDraftForStartedAppointment(manager: EntityManager, appointment: CareAppointment, careRequest: CareRequest, actorUserId: string): Promise<ClinicalRecord | null> {
    const definition = await manager.getRepository(CareServiceDefinition).findOne({ where: { id: careRequest.careServiceDefinitionId }, lock: { mode: 'pessimistic_read' } });
    if (!definition?.clinicalRecordType) return null;
    const repository = manager.getRepository(ClinicalRecord);
    const existing = await repository.findOne({ where: { careAppointmentId: appointment.id }, lock: { mode: 'pessimistic_write' } });
    if (existing) {
      if (existing.recordType !== definition.clinicalRecordType) throw new ConflictException(`Existing clinical record type must be ${definition.clinicalRecordType}`);
      return existing;
    }
    return this.createDraft(manager, appointment, careRequest, definition.clinicalRecordType, `${definition.name} Clinical Record`, null, actorUserId, {});
  }

  async getForProvider(user: User, appointmentReference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    const row = await this.readBuilder().where('appointment.reference = :appointmentReference', { appointmentReference }).andWhere('record.providerId = :providerId', { providerId: provider.id }).andWhere('careRequest.assignedProviderId = :providerId', { providerId: provider.id }).getOne();
    if (!row) this.notFound();
    return this.map(row);
  }

  async updateForAppointment(user: User, appointmentReference: string, dto: UpdateClinicalRecordDto) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.records.manager.transaction(async (manager) => {
      const record = await this.lockedOwnedRecord(manager, appointmentReference, provider.id);
      if (record.status !== ClinicalRecordStatus.DRAFT) throw new ConflictException('Finalized clinical records are read-only');
      const previousType = record.recordType;
      const nextType = dto.recordType ?? record.recordType;
      this.validateTypedDetail(nextType, dto.consultation);
      if (dto.title !== undefined) record.title = dto.title;
      if (dto.summary !== undefined) record.summary = dto.summary;
      if (dto.recordType !== undefined) record.recordType = dto.recordType;
      await manager.getRepository(ClinicalRecord).save(record);
      const details = manager.getRepository(ClinicalConsultationDetail);
      if (nextType !== ClinicalRecordType.CONSULTATION) await details.delete({ clinicalRecordId: record.id });
      else if (dto.consultation !== undefined || previousType !== nextType) await this.upsertConsultation(manager, record.id, dto.consultation ?? {});
      return this.getMapped(manager, record.id);
    });
  }

  async finalizeForAppointment(user: User, appointmentReference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.records.manager.transaction(async (manager) => {
      const record = await this.lockedOwnedRecord(manager, appointmentReference, provider.id);
      if (record.status === ClinicalRecordStatus.FINALIZED) return this.getMapped(manager, record.id);
      record.status = ClinicalRecordStatus.FINALIZED;
      record.finalizedAt = new Date();
      await manager.getRepository(ClinicalRecord).save(record);
      return this.getMapped(manager, record.id);
    });
  }

  async listMine(user: User, query: ClinicalRecordListQueryDto) {
    const patient = await this.patient(user.id);
    const builder = this.readBuilder(this.records.manager, false).where('record.patientId = :patientId', { patientId: patient.id }).andWhere('record.status = :status', { status: ClinicalRecordStatus.FINALIZED }).orderBy('record.occurredAt', 'DESC').addOrderBy('record.reference', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await builder.getManyAndCount();
    return { items: rows.map((row) => this.map(row)), page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 };
  }

  async getMine(user: User, reference: string) {
    const patient = await this.patient(user.id);
    const row = await this.readBuilder().where('record.reference = :reference', { reference }).andWhere('record.patientId = :patientId', { patientId: patient.id }).andWhere('record.status = :status', { status: ClinicalRecordStatus.FINALIZED }).getOne();
    if (!row) this.notFound();
    return this.map(row);
  }

  sharedReadBuilder(manager: EntityManager = this.records.manager) { return this.readBuilder(manager).innerJoinAndSelect('record.patient', 'patient'); }
  projectRecord(row: ClinicalRecord) { return this.map(row); }

  private async ownedAppointment(manager: EntityManager, reference: string, providerId: string, lock: 'pessimistic_read' | 'pessimistic_write') {
    const appointment = await manager.getRepository(CareAppointment).findOne({ where: { reference, providerId }, relations: { careRequest: true }, lock: { mode: lock, tables: ['care_appointments'] } });
    if (!appointment || appointment.careRequest.assignedProviderId !== providerId) throw new NotFoundException('Care Appointment was not found');
    return appointment;
  }

  private async lockedOwnedRecord(manager: EntityManager, appointmentReference: string, providerId: string) {
    const appointment = await this.ownedAppointment(manager, appointmentReference, providerId, 'pessimistic_read');
    const record = await manager.getRepository(ClinicalRecord).findOne({ where: { careAppointmentId: appointment.id, providerId }, lock: { mode: 'pessimistic_write' } });
    if (!record) this.notFound();
    return record;
  }

  private async appointmentOccurredAt(manager: EntityManager, appointment: CareAppointment): Promise<Date> {
    const rows = await manager.query(`SELECT ($1::date + $2::time) AT TIME ZONE $3 AS occurred_at`, [appointment.scheduledDate, appointment.scheduledTimeFrom, appointment.timezone]);
    return rows[0].occurred_at;
  }

  private async createDraft(manager: EntityManager, appointment: CareAppointment, careRequest: CareRequest, recordType: ClinicalRecordType, title: string, summary: string | null, actorUserId: string, consultation: ClinicalConsultationDetailDto) {
    const occurredAt = await this.appointmentOccurredAt(manager, appointment);
    const repository = manager.getRepository(ClinicalRecord);
    const record = await repository.save(repository.create({ reference: generateClinicalRecordReference(), patientId: appointment.patientId, providerId: appointment.providerId, careRequestId: careRequest.id, careAppointmentId: appointment.id, careServiceDefinitionId: careRequest.careServiceDefinitionId, recordType, title, summary, status: ClinicalRecordStatus.DRAFT, occurredAt, finalizedAt: null, createdByUserId: actorUserId }));
    if (recordType === ClinicalRecordType.CONSULTATION) await this.saveConsultation(manager, record.id, consultation);
    return record;
  }

  private validateTypedDetail(type: ClinicalRecordType, detail?: ClinicalConsultationDetailDto) {
    if (type !== ClinicalRecordType.CONSULTATION && detail !== undefined) throw new ConflictException('Consultation detail is only valid for consultation records');
  }

  private consultationValues(detail: ClinicalConsultationDetailDto) { return { presentingComplaint: detail.presentingComplaint ?? null, historyOfPresentingComplaint: detail.historyOfPresentingComplaint ?? null, observations: detail.observations ?? null, assessment: detail.assessment ?? null, diagnosis: detail.diagnosis ?? null, plan: detail.plan ?? null, followUpInstructions: detail.followUpInstructions ?? null }; }
  private async saveConsultation(manager: EntityManager, clinicalRecordId: string, detail: ClinicalConsultationDetailDto) { const repository = manager.getRepository(ClinicalConsultationDetail); await repository.save(repository.create({ clinicalRecordId, ...this.consultationValues(detail) })); }
  private async upsertConsultation(manager: EntityManager, clinicalRecordId: string, detail: ClinicalConsultationDetailDto) { const repository = manager.getRepository(ClinicalConsultationDetail); const row = await repository.findOne({ where: { clinicalRecordId } }); if (!row) return this.saveConsultation(manager, clinicalRecordId, detail); Object.assign(row, this.consultationValues(detail)); await repository.save(row); }

  private readBuilder(manager: EntityManager = this.records.manager, includeAttachments = true) { const builder = manager.getRepository(ClinicalRecord).createQueryBuilder('record').innerJoinAndSelect('record.provider', 'provider').leftJoinAndSelect('record.careRequest', 'careRequest').leftJoinAndSelect('record.careAppointment', 'appointment').leftJoinAndSelect('record.careServiceDefinition', 'definition').leftJoinAndSelect('record.consultation', 'consultation'); return includeAttachments ? builder.leftJoinAndSelect('record.attachments', 'attachment') : builder; }
  private async getMapped(manager: EntityManager, id: string) { return this.map(await this.readBuilder(manager).where('record.id = :id', { id }).getOneOrFail()); }
  private map(row: ClinicalRecord) { return { reference: row.reference, recordType: row.recordType, title: row.title, summary: row.summary, status: row.status, occurredAt: row.occurredAt, finalizedAt: row.finalizedAt, provider: { providerReference: row.provider.providerReference, displayName: row.provider.displayName, providerType: row.provider.providerType }, careRequestReference: row.careRequest?.reference ?? null, careAppointmentReference: row.careAppointment?.reference ?? null, service: row.careServiceDefinition ? { code: row.careServiceDefinition.code, name: row.careServiceDefinition.name } : null, consultation: row.recordType === ClinicalRecordType.CONSULTATION && row.consultation ? { presentingComplaint: row.consultation.presentingComplaint, historyOfPresentingComplaint: row.consultation.historyOfPresentingComplaint, observations: row.consultation.observations, assessment: row.consultation.assessment, diagnosis: row.consultation.diagnosis, plan: row.consultation.plan, followUpInstructions: row.consultation.followUpInstructions } : null, attachments: (row.attachments ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.reference.localeCompare(b.reference)).map((attachment) => ({ reference: attachment.reference, originalName: attachment.originalName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, resourceType: attachment.resourceType, createdAt: attachment.createdAt })), createdAt: row.createdAt, updatedAt: row.updatedAt }; }
  private async patient(userId: string) { const patient = await this.patients.findOne({ where: { userId }, withDeleted: true }); if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found'); return patient; }
  private constraint(error: unknown) { if (typeof error !== 'object' || error === null) return null; const value = error as { constraint?: string; driverError?: { constraint?: string } }; return value.constraint ?? value.driverError?.constraint ?? null; }
  private notFound(): never { throw new NotFoundException('Clinical Record was not found'); }
}
