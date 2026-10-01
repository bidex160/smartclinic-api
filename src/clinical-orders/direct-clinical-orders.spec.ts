import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { ClinicalRecord } from '../clinical-records/entities/clinical-record.entity';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { Patient } from '../patients/entities/patient.entity';
import { PatientRelationship } from '../patients/entities/patient-relationship.entity';
import { ClinicalOrdersService } from './clinical-orders.service';
import { ClinicalDiagnosticOrderItem } from './entities/clinical-diagnostic-order-item.entity';
import { ClinicalOrderStatusHistory } from './entities/clinical-order-status-history.entity';
import { ClinicalOrder } from './entities/clinical-order.entity';
import { ClinicalPrescriptionDetail } from './entities/clinical-prescription-detail.entity';
import { ClinicalPrescriptionItem } from './entities/clinical-prescription-item.entity';
import { ClinicalOrderOrigin, ClinicalOrderPatientResponse } from './enums/clinical-order-origin.enum';
import { ClinicalOrderStatus } from './enums/clinical-order-status.enum';
import { ClinicalOrderType } from './enums/clinical-order-type.enum';

describe('ClinicalOrdersService direct requests', () => {
  const doctor: any = { id: 'doctor-user' };
  const patientUser: any = { id: 'patient-user' };
  let provider: any;
  let patient: any;
  let saved: any;
  let repos: Record<string, any>;
  let manager: any;
  let notifications: any;
  let fulfillments: any;
  let readQb: any;
  let service: ClinicalOrdersService;

  beforeEach(() => {
    provider = { id: 'provider-id', displayName: 'Dr Bisi Clinic', providerType: 'CLINIC', status: 'ACTIVE', providerReference: 'SCPR-1' };
    patient = { id: 'patient-id', patientReference: 'SCP-ABCD-1234', givenName: 'Adaeze', familyName: 'Okafor', userId: 'patient-user', status: 'ACTIVE', deletedAt: null };
    saved = {};
    const repo = (name: string, extra: Record<string, unknown> = {}) => ({
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const row = Array.isArray(value) ? value : { id: `${name}-id`, ...value };
        saved[name] = row;
        return row;
      }),
      ...extra,
    });
    repos = {
      record: repo('record'),
      order: repo('order', { findOne: jest.fn() }),
      detail: repo('detail'),
      items: repo('items', { delete: jest.fn() }),
      diagnostic: repo('diagnostic'),
      history: repo('history'),
      patient: { findOne: jest.fn(async ({ where }: any) => (where.patientReference === patient.patientReference || where.userId === patient.userId ? patient : null)) },
      relationship: { find: jest.fn().mockResolvedValue([]) },
    };
    const byEntity = new Map<unknown, any>([
      [ClinicalRecord, repos.record],
      [ClinicalOrder, repos.order],
      [ClinicalPrescriptionDetail, repos.detail],
      [ClinicalPrescriptionItem, repos.items],
      [ClinicalDiagnosticOrderItem, repos.diagnostic],
      [ClinicalOrderStatusHistory, repos.history],
      [Patient, repos.patient],
      [PatientRelationship, repos.relationship],
    ]);
    readQb = {};
    for (const method of ['leftJoinAndSelect', 'innerJoinAndSelect', 'leftJoinAndMapMany', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) readQb[method] = jest.fn().mockReturnValue(readQb);
    readQb.getOneOrFail = jest.fn(async () => ({
      ...saved.order,
      patient,
      orderingProvider: provider,
      careRequest: null,
      careAppointment: null,
      clinicalRecord: { reference: 'SC-CLR-ABCDEF123456' },
      prescription: null,
      diagnosticItems: [],
    }));
    readQb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    manager = {
      transaction: jest.fn(async (work: any) => work(manager)),
      getRepository: jest.fn((entity: unknown) => byEntity.get(entity) ?? {}),
    };
    repos.order.manager = manager;
    repos.order.createQueryBuilder = jest.fn(() => readQb);
    notifications = { createTransactionalNotification: jest.fn() };
    fulfillments = { cancelOpenForOrder: jest.fn(), summaries: jest.fn().mockResolvedValue(new Map()) };
    service = new ClinicalOrdersService(repos.order, repos.patient, { resolveOperational: jest.fn().mockResolvedValue(provider) } as any, fulfillments, notifications);
  });

  it('confirms a SmartClinic ID with a first name and initial only', async () => {
    await expect(service.lookupDirectPatient(doctor, 'SCP-ABCD-1234')).resolves.toEqual({ patientReference: 'SCP-ABCD-1234', displayName: 'Adaeze O.' });
    await expect(service.lookupDirectPatient(doctor, 'SCP-ZZZZ-9999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends a prescription without an appointment, awaiting the patient', async () => {
    const result: any = await service.createDirect(doctor, {
      patientReference: 'SCP-ABCD-1234',
      type: ClinicalOrderType.PRESCRIPTION,
      clinicalNote: ' Uncomplicated malaria ',
      prescriptionItems: [{ medicationName: 'Artemether/Lumefantrine', dosage: '4 tablets', frequency: 'Twice daily' }],
    });

    expect(saved.order).toMatchObject({
      patientId: 'patient-id',
      orderingProviderId: 'provider-id',
      careRequestId: null,
      careAppointmentId: null,
      clinicalRecordId: 'record-id',
      origin: ClinicalOrderOrigin.DIRECT,
      patientResponse: ClinicalOrderPatientResponse.PENDING,
      status: ClinicalOrderStatus.ISSUED,
      clinicalNote: 'Uncomplicated malaria',
    });
    expect(saved.record).toMatchObject({ patientId: 'patient-id', careAppointmentId: null, status: 'FINALIZED', title: 'Prescription from Dr Bisi Clinic' });
    expect(saved.items[0]).toMatchObject({ medicationName: 'Artemether/Lumefantrine', sortOrder: 0 });
    expect(result).toMatchObject({ origin: 'DIRECT', patientResponse: 'PENDING', careAppointmentReference: null });
  });

  it('notifies the patient and guardians without naming medicines or tests', async () => {
    repos.relationship.find.mockResolvedValue([{ relatedUserId: 'guardian-user', endedAt: null }, { relatedUserId: 'old-guardian', endedAt: new Date() }]);
    await service.createDirect(doctor, {
      patientReference: 'SCP-ABCD-1234',
      type: ClinicalOrderType.LABORATORY,
      diagnosticItems: [{ name: 'HIV 1&2 screening' }],
    });

    const sent = notifications.createTransactionalNotification.mock.calls.map(([, input]: any) => input);
    expect(sent.map((n: any) => n.userId)).toEqual(['patient-user', 'guardian-user']);
    expect(sent[0]).toMatchObject({
      type: NotificationType.CLINICAL_ORDER_RECEIVED,
      entityType: NotificationEntityType.CLINICAL_ORDER,
      title: 'New lab test request from Dr Bisi Clinic',
    });
    expect(JSON.stringify(sent)).not.toContain('HIV');
    expect(saved.diagnostic[0]).toMatchObject({ name: 'HIV 1&2 screening', sortOrder: 0 });
  });

  it('only lets clinicians and care facilities send requests', async () => {
    provider.providerType = 'PHARMACY';
    await expect(service.createDirect(doctor, { patientReference: 'SCP-ABCD-1234', type: ClinicalOrderType.LABORATORY, diagnosticItems: [{ name: 'FBC' }] })).rejects.toBeInstanceOf(ForbiddenException);
    provider.providerType = 'CLINIC';
    provider.status = 'SUSPENDED';
    await expect(service.lookupDirectPatient(doctor, 'SCP-ABCD-1234')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires items that match the request type', async () => {
    await expect(service.createDirect(doctor, { patientReference: 'SCP-ABCD-1234', type: ClinicalOrderType.PRESCRIPTION, diagnosticItems: [{ name: 'FBC' }] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only this provider’s direct requests', async () => {
    await service.listDirect(doctor, { page: 1, limit: 20 });
    expect(readQb.where).toHaveBeenCalledWith('order.orderingProviderId=:providerId', { providerId: 'provider-id' });
    expect(readQb.andWhere).toHaveBeenCalledWith('order.origin=:origin', { origin: ClinicalOrderOrigin.DIRECT });
  });

  describe('patient response', () => {
    let order: any;
    beforeEach(() => {
      order = { id: 'order-id', reference: 'SC-ORD-ABCDEF123456', patientId: 'patient-id', origin: ClinicalOrderOrigin.DIRECT, patientResponse: ClinicalOrderPatientResponse.PENDING, status: ClinicalOrderStatus.ISSUED };
      repos.order.findOne.mockResolvedValue(order);
      repos.order.save.mockImplementation(async (value: any) => (saved.order = value));
    });

    it('declining cancels the request and any open handoff', async () => {
      await service.respondMine(patientUser, order.reference, ClinicalOrderPatientResponse.DECLINED);
      expect(order).toMatchObject({ patientResponse: 'DECLINED', status: ClinicalOrderStatus.CANCELLED, cancellationReason: 'Declined by patient' });
      expect(fulfillments.cancelOpenForOrder).toHaveBeenCalledWith(manager, 'order-id', 'patient-user', 'Declined by patient');
    });

    it('approving keeps the request open, and a second answer is refused', async () => {
      await service.respondMine(patientUser, order.reference, ClinicalOrderPatientResponse.APPROVED);
      expect(order).toMatchObject({ patientResponse: 'APPROVED', status: ClinicalOrderStatus.ISSUED });
      await expect(service.respondMine(patientUser, order.reference, ClinicalOrderPatientResponse.DECLINED)).rejects.toBeInstanceOf(ConflictException);
    });

    it('hides requests for other patients and appointment orders', async () => {
      order.patientId = 'someone-else';
      await expect(service.respondMine(patientUser, order.reference, ClinicalOrderPatientResponse.APPROVED)).rejects.toBeInstanceOf(NotFoundException);
      order.patientId = 'patient-id';
      order.origin = ClinicalOrderOrigin.APPOINTMENT;
      await expect(service.respondMine(patientUser, order.reference, ClinicalOrderPatientResponse.APPROVED)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
