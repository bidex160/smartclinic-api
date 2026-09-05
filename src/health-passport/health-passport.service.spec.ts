import { NotFoundException } from '@nestjs/common';
import { HealthPassportProvenance, HealthPassportService, HealthPassportTimelineType } from './health-passport.service';

describe('HealthPassportService', () => {
  const repo = () => ({ findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), countBy: jest.fn().mockResolvedValue(0), createQueryBuilder: jest.fn() });
  let patients: ReturnType<typeof repo>;
  let service: HealthPassportService;

  beforeEach(() => {
    patients = repo();
    service = new HealthPassportService(
      patients as never, repo() as never, repo() as never, repo() as never,
      repo() as never, repo() as never, repo() as never, repo() as never,
      repo() as never, repo() as never, repo() as never, repo() as never,
      { project: jest.fn((action) => ({ type: action.type, source: action.source })) } as never,
    );
  });

  it('enforces ownership through the authenticated user patient relationship', async () => {
    patients.findOne.mockResolvedValue(null);
    await expect(service.timeline('another-user', { page: 1, limit: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(patients.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'another-user' }) }));
  });

  it('returns a safe compact overview without contact or internal identifiers', async () => {
    patients.findOne.mockResolvedValue({ id: 'internal-patient', patientReference: 'SCP-123', givenName: 'Ada', familyName: 'Okafor', dateOfBirth: '1990-01-01', status: 'ACTIVE', deletedAt: null, email: 'private@example.test', phone: 'secret' });
    jest.spyOn(service as never, 'summary' as never).mockResolvedValue({ completedSelfChecks: 1 } as never);
    jest.spyOn(service as never, 'measurements' as never).mockResolvedValue([] as never);
    jest.spyOn(service as never, 'recentChecks' as never).mockResolvedValue({ selfChecks: [], healthChecks: [] } as never);
    jest.spyOn(service as never, 'currentNextAction' as never).mockResolvedValue(null as never);
    jest.spyOn(service as never, 'reportedHistory' as never).mockResolvedValue([] as never);
    jest.spyOn(service as never, 'timelineForPatient' as never).mockResolvedValue({ items: [] } as never);
    jest.spyOn(service as never, 'recentPrescriptions' as never).mockResolvedValue([] as never);
    const result = await service.overview('user-a');
    expect(result.patient).toEqual({ patientReference: 'SCP-123', givenName: 'Ada', familyName: 'Okafor', displayName: 'Ada Okafor', dateOfBirth: '1990-01-01' });
    expect(JSON.stringify(result)).not.toContain('internal-patient');
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('keeps latest measurements separately by type and provenance', async () => {
    jest.spyOn(service as never, 'reportedMeasurements' as never).mockResolvedValue([
      { type: 'BLOOD_PRESSURE', value: { systolic: 120, diastolic: 80 }, unit: 'mmHg', recordedAt: new Date('2026-01-02'), provenance: HealthPassportProvenance.REPORTED_BY_YOU, sourceDomain: 'GUIDED_SELF_CHECK', sourceReference: 'SC-GSC-A' },
    ] as never);
    jest.spyOn(service as never, 'providerMeasurements' as never).mockResolvedValue([
      { type: 'BLOOD_PRESSURE', value: { primary: '118', secondary: '78' }, unit: 'mmHg', recordedAt: new Date('2026-01-01'), provenance: HealthPassportProvenance.CHECKED_BY_PROVIDER, sourceDomain: 'HEALTH_CHECK', sourceReference: 'SCB-A' },
    ] as never);
    const result = await (service as any).measurements('patient');
    expect(result).toHaveLength(2);
    expect(result.map((x: any) => x.provenance)).toEqual([HealthPassportProvenance.REPORTED_BY_YOU, HealthPassportProvenance.CHECKED_BY_PROVIDER]);
    expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ provenance: HealthPassportProvenance.CONFIRMED_BY_LABORATORY })]));
  });

  it('merges domain events newest-first with a deterministic event-key tie break and database-bounded pagination', async () => {
    const event = (type: HealthPassportTimelineType, reference: string, time: string) => ({ eventKey: `${type}:${reference}`, type, occurredAt: new Date(time), title: type, description: type, sourceDomain: type, sourceReference: reference });
    jest.spyOn(service as never, 'selfCheckEvents' as never).mockResolvedValue([event(HealthPassportTimelineType.SELF_CHECK_COMPLETED, 'A', '2026-02-01')] as never);
    jest.spyOn(service as never, 'healthCheckEvents' as never).mockResolvedValue([event(HealthPassportTimelineType.HEALTH_CHECK_COMPLETED, 'B', '2026-03-01')] as never);
    jest.spyOn(service as never, 'careEvents' as never).mockResolvedValue([] as never);
    jest.spyOn(service as never, 'recordEvents' as never).mockResolvedValue([] as never);
    jest.spyOn(service as never, 'prescriptionEvents' as never).mockResolvedValue([] as never);
    jest.spyOn(service as never, 'dispensingEvents' as never).mockResolvedValue([] as never);
    jest.spyOn(service as never, 'timelineTotal' as never).mockResolvedValue(2 as never);
    const result = await (service as any).timelineForPatient('patient', { page: 1, limit: 1 });
    expect(result.items[0].sourceReference).toBe('B');
    expect(result).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect((service as any).selfCheckEvents).toHaveBeenCalledWith('patient', 1);
  });

  it('keeps configuration-required completion neutral rather than presenting GREEN', async () => {
    const selfChecks = (service as any).selfChecks;
    selfChecks.find.mockResolvedValue([{ id: 'self-check-1', reference: 'SC-GSC-1', completedAt: new Date(), classificationStatus: 'CONFIGURATION_REQUIRED' }]);
    const [event] = await (service as any).selfCheckEvents('patient', 10);
    expect(event.context.classificationStatus).toBe('CONFIGURATION_REQUIRED');
    expect(event.description).toContain('awaiting clinical processing');
    expect(JSON.stringify(event)).not.toContain('GREEN');
    expect(JSON.stringify(event)).not.toContain('warning sign');
  });

  it('builds a restricted shareable projection from completed patient-visible Passport sources', async () => {
    patients.findOne.mockResolvedValue({ id: 'patient-id', patientReference: 'SCP-AB12-CD34', givenName: 'Ada', familyName: 'Okafor', dateOfBirth: '1990-01-01', status: 'ACTIVE', deletedAt: null, email: 'private@example.test' });
    (service as any).selfChecks.countBy.mockResolvedValue(1);
    jest.spyOn(service as never, 'selfCheckEvents' as never).mockResolvedValue([{ sourceDomain: 'GUIDED_SELF_CHECK', sourceReference: 'SC-GSC-1', provenance: HealthPassportProvenance.REPORTED_BY_YOU }] as never);
    jest.spyOn(service as never, 'shareableHealthChecks' as never).mockResolvedValue([] as never);
    jest.spyOn(service as never, 'reportedHistory' as never).mockResolvedValue([{ key: 'allergy_details', provenance: HealthPassportProvenance.REPORTED_BY_YOU }] as never);
    jest.spyOn(service as never, 'reportedMeasurements' as never).mockResolvedValue([{ type: 'BLOOD_PRESSURE', provenance: HealthPassportProvenance.REPORTED_BY_YOU }] as never);
    jest.spyOn(service as never, 'shareableClinicalRecords' as never).mockResolvedValue([{ reference: 'SC-CLR-1' }] as never);
    const result = await service.shareableForProvider('patient-id', false);
    expect(result).toMatchObject({ authorization: { includesHealthPassport: true, includesFinalizedClinicalRecords: false }, guidedSelfChecks: [expect.objectContaining({ provenance: 'REPORTED_BY_YOU' })] });
    expect(result.clinicalRecords).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('internal-patient'); expect(JSON.stringify(result)).not.toContain('private@example.test'); expect(JSON.stringify(result)).not.toContain('prompt'); expect(JSON.stringify(result)).not.toContain('modelResponse');
  });

  it('projects dynamic completed Health Check snapshot work and structured result shapes without package hardcoding', async () => {
    const query: any = {}; for (const method of ['innerJoinAndSelect','leftJoinAndSelect','where','andWhere','orderBy','addOrderBy']) query[method]=jest.fn().mockReturnValue(query);
    query.getMany=jest.fn().mockResolvedValue([{completedAt:new Date('2026-09-05'),provider:{providerReference:'SCPR-PUBLIC',displayName:'Lab Two'},measurements:[{code:'CUSTOM_BP',valueNumeric:'118',valueSecondaryNumeric:'78',unit:'mmHg',recordedAt:new Date('2026-09-05')},{code:'CHOLESTEROL',valueNumeric:'4.2',valueSecondaryNumeric:null,unit:'mmol/L',recordedAt:new Date('2026-09-05')}],booking:{bookingReference:'SC-2026-EXEC',commercialConfigurationSnapshot:{package:{code:'EXECUTIVE',name:'Executive Health Check'},fulfilmentMode:{code:'PROVIDER_LOCATION',name:'Provider location'},includedContents:[{code:'CUSTOM_BP',name:'Custom blood pressure',category:'VITALS',resultType:'BLOOD_PRESSURE',unit:'mmHg'},{code:'COUNSELLING',name:'Counselling',category:'SERVICE',resultType:'NONE',unit:null}],selectedAddons:[{code:'CHOLESTEROL',name:'Cholesterol',category:'LAB',resultType:'SINGLE_NUMERIC',unit:'mmol/L'}]},healthCheckPackage:{code:'CHANGED_LIVE',name:'Changed live'},fulfilmentMode:{code:'HOME_VISIT',name:'Changed live'}}}]);
    (service as any).encounters.createQueryBuilder.mockReturnValue(query);
    const [check] = await (service as any).shareableHealthChecks('patient-id');
    expect(check.package).toEqual({code:'EXECUTIVE',name:'Executive Health Check'});expect(check.results).toEqual(expect.arrayContaining([expect.objectContaining({code:'CUSTOM_BP',value:{systolic:'118',diastolic:'78'},provenance:'CHECKED_BY_PROVIDER'}),expect.objectContaining({code:'CHOLESTEROL',value:{value:'4.2'}})]));expect(check.results).not.toEqual(expect.arrayContaining([expect.objectContaining({code:'COUNSELLING'})]));expect(check.clinicalWork).toEqual(expect.arrayContaining([expect.objectContaining({code:'COUNSELLING',requiresRecordedResult:false})]));
    expect(query.andWhere).toHaveBeenCalledWith('encounter.status=:completed',expect.any(Object));
  });
});
