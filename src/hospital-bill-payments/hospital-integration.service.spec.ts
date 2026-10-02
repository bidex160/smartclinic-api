import { ConflictException, NotFoundException } from '@nestjs/common';
import { HospitalIntegrationService } from './hospital-integration.service';
import { PatientProviderConnectionStatus } from '../patient-provider-connections/enums/patient-provider-connection-status.enum';

describe('HospitalIntegrationService', () => {
  const akth = {} as any;
  const subject = () => new HospitalIntegrationService(akth, { hospitalBills: { akth: { name: 'AKTH - SmartBox', logo: 'https://logo.test' } } } as any);
  const connection = (overrides: any = {}) => ({
    status: PatientProviderConnectionStatus.CONNECTED,
    externalPatientReference: 'AKTH-PATIENT-1',
    provider: { hospitalCode: 'AKTH' },
    ...overrides,
  }) as any;

  it('resolves only an explicitly mapped AKTH provider', () => {
    expect(subject().resolve('AKTH')).toBe(akth);
    expect(() => subject().resolve('OTHER')).toThrow(NotFoundException);
    expect(() => subject().resolve('')).toThrow(NotFoundException);
  });

  it('does not infer AKTH from provider display name or provider reference', () => {
    expect(() => subject().resolveConnectedPatient(connection({ provider: { displayName: 'AKTH - SmartBox', providerReference: 'AKTH' } }))).toThrow(ConflictException);
  });

  it('requires a connected connection and preserves externalPatientReference', () => {
    expect(subject().resolveConnectedPatient(connection())).toMatchObject({ hospitalCode: 'AKTH', adapter: akth, externalPatientReference: 'AKTH-PATIENT-1' });
    expect(() => subject().resolveConnectedPatient(connection({ status: PatientProviderConnectionStatus.SUBMITTED }))).toThrow(ConflictException);
    expect(() => subject().resolveConnectedPatient(connection({ externalPatientReference: null }))).toThrow(ConflictException);
  });

  it('rejects an unmapped provider even when the connection is connected', () => {
    expect(() => subject().resolveConnectedPatient(connection({ provider: { hospitalCode: null } }))).toThrow(ConflictException);
    expect(() => subject().resolveConnectedPatient(connection({ provider: { hospitalCode: 'OTHER' } }))).toThrow(NotFoundException);
  });
});
