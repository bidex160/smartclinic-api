import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ClinicalOrdersService } from '../../clinical-orders/clinical-orders.service';
import { CurrentProviderService } from '../../providers/current-provider.service';
import { ApiKeyGuard } from '../api-key.guard';
import { FhirController } from './fhir.controller';
import {
  diagnosticReportResource,
  directOrderFromMedicationRequests,
  directOrderFromServiceRequests,
  groupBundleEntries,
  medicationRequestResources,
  OrderView,
  serviceRequestResource,
  SYSTEM,
} from './fhir.mapper';

const labOrder = (over: Partial<OrderView> = {}): OrderView => ({
  reference: 'SC-ORD-ABCDEF123456',
  patient: { patientReference: 'SCP-ABCD-1234', displayName: 'Adaeze O.' },
  type: 'LABORATORY',
  status: 'ISSUED',
  clinicalNote: 'Fever for 3 days',
  orderingProvider: { providerReference: 'SCPR-1', displayName: 'Dr Bisi Clinic', providerType: 'CLINIC' },
  patientResponse: 'PENDING',
  issuedAt: '2026-10-02T09:00:00Z',
  cancelledAt: null,
  cancellationReason: null,
  diagnosticItems: [
    { name: 'Malaria parasite (MP)', code: 'LAB-MP', instructions: null, resultText: null, resultValue: null, resultUnit: null, referenceRange: null, resultFlag: null, resultedAt: null },
    { name: 'Full blood count', code: null, instructions: null, resultText: null, resultValue: null, resultUnit: null, referenceRange: null, resultFlag: null, resultedAt: null },
  ],
  prescription: null,
  createdAt: '2026-10-02T09:00:00Z',
  updatedAt: '2026-10-02T09:00:00Z',
  ...over,
});

describe('FHIR mapping', () => {
  it('reads a lab request as a ServiceRequest with SNOMED category, consent state and every test', () => {
    const sr: any = serviceRequestResource(labOrder());
    expect(sr).toMatchObject({
      resourceType: 'ServiceRequest',
      id: 'SC-ORD-ABCDEF123456',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/SCP-ABCD-1234', display: 'Adaeze O.' },
      requester: { reference: 'Organization/SCPR-1' },
      code: { text: 'Malaria parasite (MP)', coding: [{ system: SYSTEM.catalogue, code: 'LAB-MP' }] },
      orderDetail: [{ text: 'Full blood count' }],
      note: [{ text: 'Fever for 3 days' }],
    });
    expect(sr.category[0].coding[0]).toEqual({ system: SYSTEM.snomed, code: '108252007', display: 'Laboratory procedure' });
    expect(sr.extension).toContainEqual({ url: SYSTEM.patientResponse, valueCode: 'pending' });
  });

  it('marks requests revoked when cancelled and completed once every result is in', () => {
    expect(serviceRequestResource(labOrder({ status: 'CANCELLED' })).status).toBe('revoked');
    const done = labOrder();
    done.diagnosticItems = done.diagnosticItems.map((i) => ({ ...i, resultValue: '4.5', resultedAt: '2026-10-03T10:00:00Z' }));
    expect(serviceRequestResource(done).status).toBe('completed');
  });

  it('reports results as a DiagnosticReport with Observations, numeric or text, flagged', () => {
    const order = labOrder();
    order.diagnosticItems[0] = { ...order.diagnosticItems[0], resultValue: 'Positive', resultFlag: 'ABNORMAL', resultedAt: '2026-10-03T10:00:00Z' };
    order.diagnosticItems[1] = { ...order.diagnosticItems[1], resultValue: '11.2', resultUnit: 'g/dL', referenceRange: '12–16', resultFlag: 'low', resultedAt: '2026-10-03T11:00:00Z' };
    const dr: any = diagnosticReportResource(order);
    expect(dr).toMatchObject({ resourceType: 'DiagnosticReport', status: 'final', basedOn: [{ reference: 'ServiceRequest/SC-ORD-ABCDEF123456' }], issued: '2026-10-03T11:00:00.000Z' });
    expect(dr.contained[0]).toMatchObject({ valueString: 'Positive', interpretation: [{ coding: [{ code: 'A' }] }] });
    expect(dr.contained[1]).toMatchObject({ valueQuantity: { value: 11.2, unit: 'g/dL' }, referenceRange: [{ text: '12–16' }], interpretation: [{ coding: [{ code: 'L' }] }] });
    expect(dr.result).toEqual([{ reference: '#obs-1' }, { reference: '#obs-2' }]);
    expect(diagnosticReportResource(labOrder()).status).toBe('registered');
  });

  it('reads a prescription as one MedicationRequest per medicine, grouped by the order', () => {
    const rx = labOrder({
      type: 'PRESCRIPTION',
      diagnosticItems: [],
      prescription: { notes: null, items: [
        { medicationName: 'Paracetamol', strength: '500 mg', dosage: '1 tablet', frequency: 'Twice daily', duration: '3 days', quantity: '6 tablets', route: 'Oral', instructions: 'After food' },
        { medicationName: 'ORS', strength: null, dosage: '1 sachet', frequency: 'After each stool', duration: null, quantity: null, route: null, instructions: null },
      ] },
    });
    const [first, second]: any[] = medicationRequestResources(rx);
    expect(first).toMatchObject({
      id: 'SC-ORD-ABCDEF123456-1',
      groupIdentifier: { value: 'SC-ORD-ABCDEF123456' },
      medicationCodeableConcept: { text: 'Paracetamol 500 mg' },
      dosageInstruction: [{ text: '1 tablet, Twice daily', timing: { code: { text: 'Twice daily' } }, route: { text: 'Oral' }, patientInstruction: 'After food' }],
      dispenseRequest: { quantity: { unit: '6 tablets' }, expectedSupplyDuration: { unit: '3 days' } },
    });
    expect(second.id).toBe('SC-ORD-ABCDEF123456-2');
  });

  it('turns an EMR ServiceRequest into a SmartClinic lab request', () => {
    expect(
      directOrderFromServiceRequests([
        {
          resourceType: 'ServiceRequest',
          category: [{ coding: [{ system: 'http://snomed.info/sct', code: '108252007' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '32700-7', display: 'Malaria smear' }] },
          orderDetail: [{ text: 'Widal test' }],
          subject: { reference: 'Patient/SCP-ABCD-1234' },
          reasonCode: [{ text: 'Fever' }],
          patientInstruction: 'Fasting not needed',
        },
      ]),
    ).toEqual({
      patientReference: 'SCP-ABCD-1234',
      type: 'LABORATORY',
      clinicalNote: 'Fever',
      diagnosticItems: [
        { name: 'Malaria smear', instructions: 'Fasting not needed' },
        { name: 'Widal test', instructions: 'Fasting not needed' },
      ],
    });
  });

  it('needs a category, a patient and a named test, and says how to fix each', () => {
    expect(() => directOrderFromServiceRequests([{ resourceType: 'ServiceRequest', subject: { reference: 'Patient/SCP-ABCD-1234' }, code: { text: 'FBC' } }])).toThrow(/category/);
    expect(() => directOrderFromServiceRequests([{ resourceType: 'ServiceRequest', category: [{ text: 'Laboratory' }], code: { text: 'FBC' } }])).toThrow(/subject/);
    expect(() => directOrderFromServiceRequests([{ resourceType: 'ServiceRequest', category: [{ text: 'Laboratory' }], subject: { reference: 'Patient/SCP-ABCD-1234' } }])).toThrow(/Name the test/);
  });

  it('turns a referral reason into the referral note', () => {
    expect(
      directOrderFromServiceRequests([{ resourceType: 'ServiceRequest', category: [{ coding: [{ system: SYSTEM.snomed, code: '3457005' }] }], subject: { identifier: { value: 'SCP-ABCD-1234' } }, reasonCode: [{ text: 'Cardiology review' }] }]),
    ).toEqual({ patientReference: 'SCP-ABCD-1234', type: 'REFERRAL', clinicalNote: 'Cardiology review' });
  });

  it('turns MedicationRequests into one prescription', () => {
    expect(
      directOrderFromMedicationRequests([
        { resourceType: 'MedicationRequest', subject: { reference: 'Patient/SCP-ABCD-1234' }, medicationCodeableConcept: { text: 'Amoxicillin 500 mg' }, dosageInstruction: [{ text: '1 capsule', timing: { code: { text: 'Three times daily' } }, route: { text: 'Oral' } }], dispenseRequest: { quantity: { value: 15, unit: 'capsules' }, expectedSupplyDuration: { value: 5, unit: 'days' } } },
      ]),
    ).toEqual({
      patientReference: 'SCP-ABCD-1234',
      type: 'PRESCRIPTION',
      prescriptionItems: [{ medicationName: 'Amoxicillin 500 mg', dosage: '1 capsule', frequency: 'Three times daily', route: 'Oral', quantity: '15 capsules', duration: '5 days' }],
    });
  });

  it('groups Bundle entries by patient, kind and requisition', () => {
    const sr = (req: string) => ({ resource: { resourceType: 'ServiceRequest', category: [{ text: 'lab' }], subject: { reference: 'Patient/SCP-ABCD-1234' }, code: { text: 'X' }, requisition: { value: req } } });
    const mr = { resource: { resourceType: 'MedicationRequest', subject: { reference: 'Patient/SCP-ABCD-1234' }, groupIdentifier: { value: 'RX1' } } };
    const groups = groupBundleEntries({ resourceType: 'Bundle', type: 'batch', entry: [sr('A'), sr('A'), sr('B'), mr, mr] });
    expect(groups.map((g) => [g.kind, g.entries])).toEqual([
      ['ServiceRequest', [0, 1]],
      ['ServiceRequest', [2]],
      ['MedicationRequest', [3, 4]],
    ]);
    expect(() => groupBundleEntries({ resourceType: 'Bundle', type: 'collection', entry: [] })).toThrow(/batch/);
    expect(() => groupBundleEntries({ resourceType: 'Bundle', type: 'batch', entry: [{ resource: { resourceType: 'Observation' } }] })).toThrow(/only ServiceRequest and MedicationRequest/);
  });
});

describe('FHIR API over HTTP', () => {
  let app: INestApplication;
  const orders = {
    createDirect: jest.fn(),
    getProvider: jest.fn(),
    listDirect: jest.fn(),
    lookupDirectPatient: jest.fn(),
    cancel: jest.fn(),
  };
  const currentProvider = { resolveActor: jest.fn(async () => ({ provider: { providerReference: 'SCPR-1', displayName: 'Dr Bisi Clinic', providerType: 'CLINIC' } })) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FhirController],
      providers: [
        { provide: ClinicalOrdersService, useValue: orders },
        { provide: CurrentProviderService, useValue: currentProvider },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: (ctx: any) => ((ctx.switchToHttp().getRequest().user = { id: 'owner' }), true) })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    (app as NestExpressApplication).useBodyParser('json', { type: ['application/json', 'application/fhir+json'] });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('publishes a CapabilityStatement without a key', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/fhir/r4/metadata').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/fhir\+json/);
    expect(res.body).toMatchObject({ resourceType: 'CapabilityStatement', fhirVersion: '4.0.1' });
    expect(res.body.rest[0].resource.map((r: any) => r.type)).toEqual(['Patient', 'Organization', 'ServiceRequest', 'MedicationRequest', 'DiagnosticReport']);
  });

  it('creates a lab request from application/fhir+json and answers 201 with Location', async () => {
    orders.createDirect.mockResolvedValue(labOrder());
    const res = await request(app.getHttpServer())
      .post('/api/v1/fhir/r4/ServiceRequest')
      .set('Content-Type', 'application/fhir+json')
      .send(JSON.stringify({ resourceType: 'ServiceRequest', status: 'active', intent: 'order', category: [{ text: 'Laboratory' }], code: { text: 'Malaria parasite (MP)' }, subject: { reference: 'Patient/SCP-ABCD-1234' } }))
      .expect(201);
    expect(orders.createDirect).toHaveBeenCalledWith({ id: 'owner' }, expect.objectContaining({ patientReference: 'SCP-ABCD-1234', type: 'LABORATORY', diagnosticItems: [{ name: 'Malaria parasite (MP)' }] }));
    expect(res.headers.location).toMatch(/\/api\/v1\/fhir\/r4\/ServiceRequest\/SC-ORD-ABCDEF123456$/);
    expect(res.body).toMatchObject({ resourceType: 'ServiceRequest', id: 'SC-ORD-ABCDEF123456' });
  });

  it('answers errors as OperationOutcome with the right status', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/fhir/r4/ServiceRequest').send({ resourceType: 'ServiceRequest', subject: { reference: 'Patient/SCP-ABCD-1234' }, code: { text: 'X' } }).expect(400);
    expect(res.body).toMatchObject({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid' }] });
    expect(res.body.issue[0].diagnostics).toMatch(/category/);
    const missing = await request(app.getHttpServer()).get('/api/v1/fhir/r4/ServiceRequest/not-a-reference').expect(404);
    expect(missing.body.issue[0].code).toBe('not-found');
    expect(orders.createDirect).not.toHaveBeenCalled();
  });

  it('applies the REST API validation to FHIR input', async () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => ({ text: `Test ${i}` }));
    const res = await request(app.getHttpServer())
      .post('/api/v1/fhir/r4/ServiceRequest')
      .send({ resourceType: 'ServiceRequest', category: [{ text: 'lab' }], subject: { reference: 'Patient/SCP-ABCD-1234' }, code: { text: 'A' }, orderDetail: tooMany })
      .expect(400);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(orders.createDirect).not.toHaveBeenCalled();
  });

  it('finds a patient by SmartClinic ID, masked, and returns an empty Bundle for an unknown ID', async () => {
    orders.lookupDirectPatient.mockResolvedValueOnce({ patientReference: 'SCP-ABCD-1234', displayName: 'Adaeze O.' });
    const found = await request(app.getHttpServer()).get(`/api/v1/fhir/r4/Patient?identifier=${encodeURIComponent(`${SYSTEM.smartClinicId}|SCP-ABCD-1234`)}`).expect(200);
    expect(found.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset', total: 1, entry: [{ resource: { resourceType: 'Patient', name: [{ text: 'Adaeze O.' }] } }] });
    const { NotFoundException } = await import('@nestjs/common');
    orders.lookupDirectPatient.mockRejectedValueOnce(new NotFoundException('No patient'));
    const none = await request(app.getHttpServer()).get('/api/v1/fhir/r4/Patient?identifier=SCP-ZZZZ-9999').expect(200);
    expect(none.body).toMatchObject({ resourceType: 'Bundle', total: 0 });
  });

  it('serves results for a request and cancels with $cancel', async () => {
    orders.getProvider.mockResolvedValue(labOrder());
    const report = await request(app.getHttpServer()).get('/api/v1/fhir/r4/DiagnosticReport?based-on=ServiceRequest/SC-ORD-ABCDEF123456').expect(200);
    expect(report.body.entry[0].resource).toMatchObject({ resourceType: 'DiagnosticReport', status: 'registered' });
    const cancelled = await request(app.getHttpServer())
      .post('/api/v1/fhir/r4/ServiceRequest/SC-ORD-ABCDEF123456/$cancel')
      .send({ resourceType: 'Parameters', parameter: [{ name: 'reason', valueString: 'Entered in error' }] })
      .expect(200);
    expect(orders.cancel).toHaveBeenCalledWith({ id: 'owner' }, 'SC-ORD-ABCDEF123456', { reason: 'Entered in error' });
    expect(cancelled.body).toMatchObject({ resourceType: 'OperationOutcome', issue: [{ severity: 'information' }] });
  });

  it('creates one SmartClinic request per group in a Bundle and checks every entry before sending any', async () => {
    orders.createDirect.mockImplementation(async (_u: unknown, dto: any) => labOrder({ type: dto.type, prescription: dto.type === 'PRESCRIPTION' ? { notes: null, items: dto.prescriptionItems.map((i: any) => ({ strength: null, duration: null, quantity: null, route: null, instructions: null, ...i })) } : null }));
    const sr = { resourceType: 'ServiceRequest', category: [{ text: 'Laboratory' }], subject: { reference: 'Patient/SCP-ABCD-1234' }, code: { text: 'FBC' }, requisition: { value: 'REQ-1' } };
    const mr = { resourceType: 'MedicationRequest', subject: { reference: 'Patient/SCP-ABCD-1234' }, medicationCodeableConcept: { text: 'Paracetamol' }, dosageInstruction: [{ text: '1 tablet', timing: { code: { text: 'Twice daily' } } }] };
    const res = await request(app.getHttpServer())
      .post('/api/v1/fhir/r4')
      .send({ resourceType: 'Bundle', type: 'transaction', entry: [{ resource: sr }, { resource: { ...sr, code: { text: 'MP' } } }, { resource: mr }] })
      .expect(200);
    expect(orders.createDirect).toHaveBeenCalledTimes(2);
    expect(res.body.type).toBe('transaction-response');
    expect(res.body.entry.map((e: any) => e.response.status)).toEqual(['201 Created', '201 Created', '201 Created']);

    orders.createDirect.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/fhir/r4')
      .send({ resourceType: 'Bundle', type: 'batch', entry: [{ resource: sr }, { resource: { ...mr, medicationCodeableConcept: {} } }] })
      .expect(400);
    expect(orders.createDirect).not.toHaveBeenCalled();
  });
});
