import { ConflictException, NotFoundException } from '@nestjs/common';

import { Patient } from '../patients/entities/patient.entity';
import { ClinicalOrderFulfillmentsService } from './clinical-order-fulfillments.service';
import { ClinicalOrderFulfillmentHistory } from './entities/clinical-order-fulfillment-history.entity';
import { ClinicalOrderFulfillment } from './entities/clinical-order-fulfillment.entity';
import { ClinicalOrder } from './entities/clinical-order.entity';
import { DiagnosticQuote } from './entities/diagnostic-quote.entity';
import { PharmacyQuote } from './entities/pharmacy-quote.entity';
import { ClinicalOrderFulfillmentStatus } from './enums/clinical-order-fulfillment-status.enum';
import { ClinicalOrderStatus } from './enums/clinical-order-status.enum';
import { ClinicalOrderType } from './enums/clinical-order-type.enum';

describe('Referring a request on to another lab or pharmacy', () => {
  const lab = { id: 'lab-a', displayName: 'Lagoon Lab' };
  let current: any;
  let order: any;
  let saved: any[];
  let repos: Record<string, any>;
  let notifications: any;
  let service: any;

  beforeEach(() => {
    current = { id: 'f-1', reference: 'SC-ORF-1', clinicalOrderId: 'order-1', fulfillmentProviderId: 'lab-a', status: ClinicalOrderFulfillmentStatus.ACCEPTED };
    order = { id: 'order-1', reference: 'SC-ORD-1', patientId: 'patient-1', type: ClinicalOrderType.LABORATORY, status: ClinicalOrderStatus.ISSUED };
    saved = [];
    repos = {
      fulfillment: { findOne: jest.fn(async () => current), save: jest.fn(async (value: any) => { const row = { id: 'f-2', ...value }; saved.push(row); return row; }) },
      order: { findOne: jest.fn(async () => order) },
      pharmacyQuote: { exists: jest.fn(async () => false), update: jest.fn() },
      diagnosticQuote: { exists: jest.fn(async () => false), update: jest.fn() },
      history: { save: jest.fn() },
      patient: { findOne: jest.fn(async () => ({ id: 'patient-1', userId: 'patient-user' })) },
    };
    const byEntity = new Map<unknown, any>([
      [ClinicalOrderFulfillment, repos.fulfillment],
      [ClinicalOrder, repos.order],
      [PharmacyQuote, repos.pharmacyQuote],
      [DiagnosticQuote, repos.diagnosticQuote],
      [ClinicalOrderFulfillmentHistory, repos.history],
      [Patient, repos.patient],
    ]);
    const manager: any = { getRepository: (entity: unknown) => byEntity.get(entity), save: jest.fn(async (value: any) => value) };
    notifications = { createTransactionalNotification: jest.fn() };
    service = new ClinicalOrderFulfillmentsService(
      { manager: { transaction: (work: any) => work(manager) } } as any,
      {} as any,
      { resolveOperational: jest.fn(async () => lab) } as any,
      notifications,
    );
    service.eligibleUnit = jest.fn(async () => ({ id: 'unit-b', providerId: 'lab-b', provider: { displayName: 'Ikeja Reference Lab' } }));
    service.mapped = jest.fn(async (_m: unknown, id: string) => ({ id }));
  });

  it('closes this handoff, proposes the new lab and tells the patient', async () => {
    await service.referOnward({ id: 'scientist' }, 'SC-ORF-1', 'SC-PSU-B', ' We don’t run HbA1c ');
    expect(current).toMatchObject({ status: 'CANCELLED', cancellationReason: 'We don’t run HbA1c' });
    expect(saved[0]).toMatchObject({
      clinicalOrderId: 'order-1',
      fulfillmentProviderId: 'lab-b',
      fulfillmentServiceUnitId: 'unit-b',
      recommendedByProviderId: 'lab-a',
      referredFromFulfillmentId: 'f-1',
      referralNote: 'We don’t run HbA1c',
      status: 'PROPOSED',
    });
    expect(repos.diagnosticQuote.update).toHaveBeenCalled();
    const [, notice] = notifications.createTransactionalNotification.mock.calls[0];
    expect(notice).toMatchObject({ userId: 'patient-user', type: 'CLINICAL_ORDER_REFERRED', entityType: 'CLINICAL_ORDER', entityReference: 'SC-ORD-1' });
    expect(notice.title).toBe('Lagoon Lab referred your request to Ikeja Reference Lab');
  });

  it('is refused once the patient has accepted a price', async () => {
    repos.diagnosticQuote.exists.mockResolvedValue(true);
    await expect(service.referOnward({ id: 'scientist' }, 'SC-ORF-1', 'SC-PSU-B', null)).rejects.toBeInstanceOf(ConflictException);
    expect(saved).toHaveLength(0);
  });

  it('needs a request the patient chose this provider for, and a different facility', async () => {
    current.status = ClinicalOrderFulfillmentStatus.PROPOSED;
    await expect(service.referOnward({ id: 'scientist' }, 'SC-ORF-1', 'SC-PSU-B', null)).rejects.toBeInstanceOf(ConflictException);
    current.status = ClinicalOrderFulfillmentStatus.SELECTED;
    service.eligibleUnit.mockResolvedValue({ id: 'unit-a2', providerId: 'lab-a', provider: lab });
    await expect(service.referOnward({ id: 'scientist' }, 'SC-ORF-1', 'SC-PSU-A2', null)).rejects.toBeInstanceOf(ConflictException);
    repos.fulfillment.findOne.mockResolvedValue(null);
    await expect(service.referOnward({ id: 'scientist' }, 'SC-ORF-X', 'SC-PSU-B', null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows the referrer results only once the new lab has accepted', async () => {
    const item = (status: string) => ({ status, clinicalOrder: { diagnosticItems: [{ name: 'HbA1c', resultValue: '7.9', resultedAt: '2026-10-02' }] } });
    service.page = jest.fn(async () => ({ items: [item('ACCEPTED'), item('PROPOSED')], page: 1, limit: 20, total: 2, totalPages: 1 }));
    const qb: any = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis() };
    service.readBuilder = jest.fn(() => qb);
    const result = await service.listReferredOut({ id: 'scientist' }, { page: 1, limit: 20 });
    expect(qb.where).toHaveBeenCalledWith('fulfillment.recommendedByProviderId=:providerId', { providerId: 'lab-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('fulfillment.referredFromFulfillmentId IS NOT NULL');
    expect(result.items[0].clinicalOrder.diagnosticItems[0].resultValue).toBe('7.9');
    expect(result.items[1].clinicalOrder.diagnosticItems[0].resultValue).toBeNull();
  });
});
