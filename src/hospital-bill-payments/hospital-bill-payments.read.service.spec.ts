import { ConflictException, NotFoundException } from '@nestjs/common';
import { HospitalBillPaymentsService } from './hospital-bill-payments.service';
import { PatientProviderConnectionStatus } from '../patient-provider-connections/enums/patient-provider-connection-status.enum';

describe('Hospital bill payment read APIs', () => {
  const patient = { id: 'patient-1', userId: 'user-1', patientReference: 'SCPAT-123', givenName: 'Ada', familyName: 'Lovelace' } as any;
  const adapter = { getInvoiceForPatient: jest.fn() };
  const metadata = { hospitalCode: 'AKTH', name: 'AKTH - SmartBox', logo: 'https://logo.test/akth.jpg' };
  const connection = (overrides: any = {}) => ({ patientId: patient.id, status: PatientProviderConnectionStatus.CONNECTED, externalPatientReference: 'AKTH-001', provider: { hospitalCode: 'AKTH' }, ...overrides }) as any;
  function subject(connectionRows: any[] = [connection()]) {
    const patients = { findOne: jest.fn().mockResolvedValue(patient) };
    const connections = { find: jest.fn().mockResolvedValue(connectionRows), findOne: jest.fn().mockResolvedValue(connectionRows[0] ?? null) };
    const integrations = {
      resolve: jest.fn().mockReturnValue(adapter),
      metadata: jest.fn().mockReturnValue(metadata),
      resolveConnectedPatient: jest.fn((value: any) => { if (value.status !== PatientProviderConnectionStatus.CONNECTED) throw new ConflictException('A connected hospital is required'); return { hospitalCode: 'AKTH', adapter, externalPatientReference: 'AKTH-001' }; }),
    };
    const service = new HospitalBillPaymentsService({} as any, {} as any, {} as any, patients as any, connections as any, {} as any, integrations as any, adapter as any, {} as any);
    return { service, patients, connections, integrations };
  }

  it('returns only explicitly mapped connected hospitals', async () => {
    const context = subject([connection(), connection({ status: PatientProviderConnectionStatus.SUBMITTED }), connection({ provider: { hospitalCode: null, displayName: 'AKTH - SmartBox' } })]);
    const result = await context.service.connectedHospitals('user-1');
    expect(result).toEqual([{ ...metadata, patientReference: patient.patientReference, externalPatientReference: 'AKTH-001' }]);
  });

  it('resolves the connected external patient reference at the adapter boundary', async () => {
    adapter.getInvoiceForPatient.mockResolvedValue({ invoiceReference: 'INV-1', currency: 'NGN', date: null, total: '100.00', outstanding: '100.00', items: [{ itemReference: 'ITEM-1', description: 'Consultation', amount: '100.00', payable: true }] });
    const context = subject();
    const result = await context.service.invoiceForPatient('user-1', 'AKTH', 'INV-1');
    expect(context.integrations.resolveConnectedPatient).toHaveBeenCalledWith(expect.objectContaining({ externalPatientReference: 'AKTH-001', status: PatientProviderConnectionStatus.CONNECTED }));
    expect(adapter.getInvoiceForPatient).toHaveBeenCalledWith({ externalPatientReference: 'AKTH-001', invoiceReference: 'INV-1' });
    expect(result).toMatchObject({ reference: 'INV-1', patient: { externalReference: 'AKTH-001' }, items: [{ itemReference: 'ITEM-1', payable: true }] });
  });

  it('does not allow an unconnected or different patient connection', async () => {
    const context = subject([connection({ status: PatientProviderConnectionStatus.SUBMITTED })]);
    await expect(context.service.invoiceForPatient('user-1', 'AKTH', 'INV-1')).rejects.toThrow(NotFoundException);
  });

  it('requires the invoice reference supplied by the Pay Bills flow', async () => {
    const context = subject();
    await expect(context.service.invoiceForPatient('user-1', 'AKTH')).rejects.toThrow('An invoice reference is required');
  });
});
