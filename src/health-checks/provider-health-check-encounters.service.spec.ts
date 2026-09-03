import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { ProviderAssignmentStatus } from '../providers/enums/provider-assignment-status.enum';
import { HealthCheckEncounter } from './entities/health-check-encounter.entity';
import { HealthCheckEncounterHistory } from './entities/health-check-encounter-history.entity';
import { HealthCheckMeasurement } from './entities/health-check-measurement.entity';
import { HealthCheckMeasurementHistory } from './entities/health-check-measurement-history.entity';
import { HealthCheckEncounterStatus } from './enums/health-check-encounter-status.enum';
import { HealthCheckMeasurementCode } from './enums/health-check-measurement-code.enum';
import { ProviderHealthCheckEncountersService } from './provider-health-check-encounters.service';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';

describe('ProviderHealthCheckEncountersService', () => {
  const user: any = { id: 'user-1' }; const provider: any = { id: 'provider-1' };
  let booking: any, assignment: any, encounter: any, measurements: any[], encounterHistory: any[], measurementHistory: any[], bookingHistory: any[];
  let encounterRepository: any, bookingRepository: any, assignmentRepository: any, measurementRepository: any, manager: any, subject: ProviderHealthCheckEncountersService;
  const dto: any = { bloodPressure: { systolic: 120, diastolic: 80 }, bloodGlucose: { value: 95 }, bmi: { value: 24.2 }, temperature: { value: 36.8 }, oxygenSaturation: { value: 98 }, pulse: { value: 72 } };
  const response: any = { bookingReference: 'SC-2026-7F23B0C9D1E4', status: HealthCheckEncounterStatus.IN_PROGRESS, measurements: [] };

  beforeEach(() => {
    booking = { id: 'booking-1', bookingReference: response.bookingReference, status: BookingStatus.SCHEDULED };
    assignment = { id: 'assignment-1', bookingId: booking.id, providerId: provider.id, status: ProviderAssignmentStatus.CONFIRMED };
    encounter = null; measurements = []; encounterHistory = []; measurementHistory = []; bookingHistory = [];
    bookingRepository = { findOne: jest.fn(async () => booking), save: jest.fn(async (value) => value) };
    assignmentRepository = { findOne: jest.fn(async () => assignment) };
    encounterRepository = { manager: null, findOne: jest.fn(async () => encounter), create: jest.fn((value) => value), save: jest.fn(async (value) => { encounter = { id: value.id ?? 'encounter-1', createdAt: new Date(), updatedAt: new Date(), ...value }; return encounter; }), createQueryBuilder: jest.fn() };
    measurementRepository = { find: jest.fn(async () => measurements), create: jest.fn((value) => value), save: jest.fn(async (value) => { const index = measurements.findIndex((row) => row.id === value.id); const saved = { id: value.id ?? `measurement-${measurements.length + 1}`, ...value }; if (index >= 0) measurements[index] = saved; else measurements.push(saved); return saved; }) };
    const historyRepository = (target: any[]) => ({ create: jest.fn((value) => value), save: jest.fn(async (value) => { target.push(value); return value; }) });
    const encounterHistoryRepository = historyRepository(encounterHistory); const measurementHistoryRepository = historyRepository(measurementHistory); const bookingHistoryRepository = historyRepository(bookingHistory);
    manager = { getRepository: jest.fn((entity) => entity === Booking ? bookingRepository : entity === ProviderAssignment ? assignmentRepository : entity === HealthCheckEncounter ? encounterRepository : entity === HealthCheckMeasurement ? measurementRepository : entity === HealthCheckEncounterHistory ? encounterHistoryRepository : entity === HealthCheckMeasurementHistory ? measurementHistoryRepository : entity === BookingStatusHistory ? bookingHistoryRepository : {}), transaction: jest.fn(async (work) => work(manager)) };
    encounterRepository.manager = manager;
    subject = new ProviderHealthCheckEncountersService(encounterRepository, { resolve: jest.fn().mockResolvedValue(provider) } as any, { recordPatientFirstCareAction: jest.fn(), logQualificationFailure: jest.fn() } as any, { markHealthCheckPayable: jest.fn().mockResolvedValue(null) } as any);
    jest.spyOn(subject, 'get').mockResolvedValue(response);
  });

  it('starts a confirmed provider encounter and advances booking with both histories', async () => {
    await subject.start(user, booking.bookingReference);
    expect(encounter).toMatchObject({ providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS, startedAt: expect.any(Date) });
    expect(booking.status).toBe(BookingStatus.IN_PROGRESS); expect(encounterHistory).toHaveLength(1); expect(bookingHistory[0]).toMatchObject({ fromStatus: BookingStatus.SCHEDULED, toStatus: BookingStatus.IN_PROGRESS, actorUserId: user.id });
  });

  it('makes an already in-progress start idempotent', async () => {
    await subject.start(user, booking.bookingReference);
    const historyCount = encounterHistory.length; booking.status = BookingStatus.IN_PROGRESS; encounter.status = HealthCheckEncounterStatus.IN_PROGRESS;
    await subject.start(user, booking.bookingReference); expect(encounterHistory).toHaveLength(historyCount);
  });

  it('no longer starts directly from PROVIDER_ASSIGNED', async () => { booking.status = BookingStatus.PROVIDER_ASSIGNED; await expect(subject.start(user, booking.bookingReference)).rejects.toBeInstanceOf(ConflictException); });

  it.each([BookingStatus.CANCELLED, BookingStatus.EXPIRED, BookingStatus.COMPLETED])('rejects starting a %s booking', async (status) => { booking.status = status; await expect(subject.start(user, booking.bookingReference)).rejects.toBeInstanceOf(ConflictException); });
  it('denies a provider without the confirmed assignment', async () => { assignmentRepository.findOne.mockResolvedValue(null); await expect(subject.start(user, booking.bookingReference)).rejects.toBeInstanceOf(NotFoundException); });
  it('denies a conflicting provider encounter', async () => { encounter = { id: 'encounter-1', providerId: 'other', providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS }; await expect(subject.start(user, booking.bookingReference)).rejects.toBeInstanceOf(NotFoundException); });

  it('saves all six structurally distinct measurements and appends creation history', async () => {
    encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS };
    await subject.saveMeasurements(user, booking.bookingReference, dto);
    expect(measurements).toHaveLength(6); expect(measurements.find((row) => row.code === HealthCheckMeasurementCode.BLOOD_PRESSURE)).toMatchObject({ valueNumeric: '120.0000', valueSecondaryNumeric: '80.0000', unit: 'mmHg' });
    expect(measurements.find((row) => row.code === HealthCheckMeasurementCode.BLOOD_GLUCOSE)).toMatchObject({ valueNumeric: '95.0000', valueSecondaryNumeric: null, unit: 'mg/dL' });
    expect(measurementHistory).toHaveLength(6); expect(measurementHistory.every((row) => row.previousValue === null)).toBe(true);
  });

  it('updates one current row per code and records previous/new audit values', async () => {
    encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS };
    await subject.saveMeasurements(user, booking.bookingReference, dto); const ids = measurements.map((row) => row.id); dto.pulse.value = 75;
    await subject.saveMeasurements(user, booking.bookingReference, dto);
    expect(measurements).toHaveLength(6); expect(measurements.map((row) => row.id)).toEqual(ids); expect(measurementHistory).toHaveLength(12);
    expect(measurementHistory.at(-1)).toMatchObject({ previousValue: { primary: '72.0000', secondary: null, unit: 'bpm' }, newValue: { primary: '75.0000', secondary: null, unit: 'bpm' } });
  });

  it('rejects edits after completion', async () => { encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.COMPLETED }; await expect(subject.saveMeasurements(user, booking.bookingReference, dto)).rejects.toBeInstanceOf(ConflictException); });

  it('requires all six measurements before completing', async () => { encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS }; booking.status = BookingStatus.IN_PROGRESS; measurements.push({ code: HealthCheckMeasurementCode.PULSE }); await expect(subject.complete(user, booking.bookingReference)).rejects.toBeInstanceOf(ConflictException); });

  it('does not block completion for a selected NONE add-on', async () => {
    booking.commercialConfigurationSnapshot = { includedContents: [{ code: 'PULSE', name: 'Pulse', category: 'MEASUREMENT', resultType: 'SINGLE_NUMERIC', unit: 'bpm' }], selectedAddons: [{ code: 'FOLLOW_UP', name: 'Follow-up', category: 'SERVICE', resultType: 'NONE', unit: null }] };
    booking.status = BookingStatus.IN_PROGRESS; encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS }; measurements = [{ code: 'PULSE', valueNumeric: '72', valueSecondaryNumeric: null }];
    await expect(subject.complete(user, booking.bookingReference)).resolves.toBe(response);
  });

  it('requires a snapshotted SINGLE_NUMERIC add-on until its result is recorded', async () => {
    booking.commercialConfigurationSnapshot = { includedContents: [], selectedAddons: [{ code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', resultType: 'SINGLE_NUMERIC', unit: 'mmol/L' }] };
    booking.status = BookingStatus.IN_PROGRESS; encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS };
    await expect(subject.complete(user, booking.bookingReference)).rejects.toThrow('CHOLESTEROL');
    measurements = [{ code: 'CHOLESTEROL', valueNumeric: '4.2', valueSecondaryNumeric: null }];
    await expect(subject.complete(user, booking.bookingReference)).resolves.toBe(response);
  });

  it('requires both persisted values for a snapshotted BLOOD_PRESSURE item', async () => {
    booking.commercialConfigurationSnapshot = { includedContents: [{ code: 'CUSTOM_BP', name: 'Custom BP', category: 'MEASUREMENT', resultType: 'BLOOD_PRESSURE', unit: 'mmHg' }], selectedAddons: [] };
    booking.status = BookingStatus.IN_PROGRESS; encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS }; measurements = [{ code: 'CUSTOM_BP', valueNumeric: '120', valueSecondaryNumeric: null }];
    await expect(subject.complete(user, booking.bookingReference)).rejects.toThrow('CUSTOM_BP');
  });

  it('persists additional results using the frozen result type and unit', async () => {
    booking.commercialConfigurationSnapshot = { includedContents: [], selectedAddons: [{ code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', resultType: 'SINGLE_NUMERIC', unit: 'mmol/L' }] };
    encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS };
    await subject.saveMeasurements(user, booking.bookingReference, { ...dto, additionalResults: [{ code: 'CHOLESTEROL', value: 4.2 }] });
    expect(measurements.find((item) => item.code === 'CHOLESTEROL')).toMatchObject({ valueNumeric: '4.2000', valueSecondaryNumeric: null, unit: 'mmol/L' });
  });

  it('uses identical snapshot requirements for HOSPITAL fulfilment', () => {
    const mapped = (subject as any).toResponse({ status: HealthCheckEncounterStatus.IN_PROGRESS, startedAt: new Date(), completedAt: null, booking: { commercialConfigurationSnapshot: { includedContents: [{ code: 'PULSE', name: 'Pulse', category: 'MEASUREMENT', resultType: 'SINGLE_NUMERIC', unit: 'bpm' }], selectedAddons: [] }, bookingReference: booking.bookingReference, participant: { givenName: 'Ada', familyName: 'Okafor' }, healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential' }, fulfilmentMode: { code: 'HOSPITAL', name: 'Hospital' } }, measurements: [] });
    expect(mapped.requirements).toEqual([expect.objectContaining({ code: 'PULSE', requiresRecordedResult: true })]);
  });

  it('completes the encounter and booking transactionally with histories', async () => {
    encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS }; booking.status = BookingStatus.IN_PROGRESS;
    measurements = Object.values(HealthCheckMeasurementCode).map((code) => ({ code })); await subject.complete(user, booking.bookingReference);
    expect(encounter.status).toBe(HealthCheckEncounterStatus.COMPLETED); expect(encounter.completedAt).toEqual(expect.any(Date)); expect(booking.status).toBe(BookingStatus.COMPLETED); expect(encounterHistory).toHaveLength(1); expect(bookingHistory[0]).toMatchObject({ fromStatus: BookingStatus.IN_PROGRESS, toStatus: BookingStatus.COMPLETED });
    expect((subject as any).earnings.markHealthCheckPayable).toHaveBeenCalledWith(manager, booking.id, user.id);
  });

  it('maps only the safe provider encounter projection', () => {
    const mapped = (subject as any).toResponse({ status: HealthCheckEncounterStatus.IN_PROGRESS, startedAt: new Date(), completedAt: null, booking: { bookingReference: booking.bookingReference, participant: { givenName: 'Ada', familyName: 'Okafor' }, healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential' }, fulfilmentMode: { code: 'HOME_VISIT', name: 'Home Visit' }, preferredLocationNote: 'Blue gate', visitAddress: { addressLine1: '12 Allen Avenue', addressLine2: 'Flat 4', city: 'Ikeja', stateOrRegion: 'Lagos', postalCode: '100271', countryCode: 'NG' } }, measurements: [{ code: HealthCheckMeasurementCode.BLOOD_PRESSURE, valueNumeric: '120.0000', valueSecondaryNumeric: '80.0000', unit: 'mmHg', recordedAt: new Date() }] });
    expect(mapped).toMatchObject({ bookingReference: booking.bookingReference, participant: { givenName: 'Ada', familyName: 'Okafor' }, visitAddress: { addressLine1: '12 Allen Avenue', addressLine2: 'Flat 4', city: 'Ikeja', stateOrRegion: 'Lagos', postalCode: '100271', countryCode: 'NG', locationNote: 'Blue gate' }, measurements: [{ value: 120, secondaryValue: 80, unit: 'mmHg' }] });
    expect(mapped).not.toHaveProperty('providerId'); expect(mapped).not.toHaveProperty('history'); expect(mapped).not.toHaveProperty('funding');
    expect(mapped).not.toHaveProperty('payment'); expect(mapped).not.toHaveProperty('contact'); expect(mapped.visitAddress).not.toHaveProperty('serviceAreaId');
  });

  it('does not project a home address for PROVIDER_LOCATION encounters', () => {
    const mapped = (subject as any).toResponse({ status: HealthCheckEncounterStatus.IN_PROGRESS, startedAt: new Date(), completedAt: null, booking: { bookingReference: booking.bookingReference, participant: { givenName: 'Ada', familyName: 'Okafor' }, healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential' }, fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' }, preferredLocationNote: 'private note', visitAddress: { addressLine1: 'Must not leak' } }, measurements: [] });
    expect(mapped.visitAddress).toBeNull();
  });

  it('uses the same authorized get projection after start, save, and complete commands', async () => {
    await subject.start(user, booking.bookingReference);
    encounter = { id: 'encounter-1', bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.IN_PROGRESS };
    await subject.saveMeasurements(user, booking.bookingReference, dto);
    booking.status = BookingStatus.IN_PROGRESS; measurements = Object.values(HealthCheckMeasurementCode).map((code) => ({ code }));
    await subject.complete(user, booking.bookingReference);
    expect(subject.get).toHaveBeenCalledTimes(3);
    expect(subject.get).toHaveBeenNthCalledWith(1, user, booking.bookingReference);
    expect(subject.get).toHaveBeenNthCalledWith(2, user, booking.bookingReference);
    expect(subject.get).toHaveBeenNthCalledWith(3, user, booking.bookingReference);
  });
});
