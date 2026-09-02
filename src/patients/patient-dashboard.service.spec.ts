import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { PatientProviderConnectionStatus } from '../patient-provider-connections/enums/patient-provider-connection-status.enum';
import { User } from '../users/entities/user.entity';
import {
  PatientDashboardMode,
  PatientDashboardActionTargetType,
  PatientDashboardRecommendedAction,
} from './dto/patient-dashboard.dto';
import { PatientStatus } from './enums/patient-status.enum';
import { PatientDashboardService } from './patient-dashboard.service';

describe('PatientDashboardService', () => {
  const user = { id: 'user-a', email: 'ada@example.test' } as User;
  const patient = {
    id: 'patient-a',
    patientReference: 'SCP-AB12-CD34',
    givenName: 'Ada',
    familyName: 'Okafor',
    email: 'ada@example.test',
    status: PatientStatus.ACTIVE,
    deletedAt: null,
  };

  let patients: { findOne: jest.Mock };
  let connections: { exists: jest.Mock };
  let careRequests: { exists: jest.Mock };
  let bookings: { exists: jest.Mock };
  let actions: { project: jest.Mock };
  let service: PatientDashboardService;

  beforeEach(() => {
    patients = { findOne: jest.fn().mockResolvedValue({ ...patient }) };
    connections = { exists: jest.fn().mockResolvedValue(false) };
    careRequests = { exists: jest.fn().mockResolvedValue(false) };
    bookings = { exists: jest.fn().mockResolvedValue(false) };
    actions = { project: jest.fn().mockResolvedValue({ type: PatientDashboardRecommendedAction.NONE, resource: null, target: { type: PatientDashboardActionTargetType.STAY_WELL } }) };
    service = new PatientDashboardService(
      patients as never,
      connections as never,
      careRequests as never,
      bookings as never,
      actions as never,
    );
  });

  it('returns a compact getting-started model for a brand-new complete patient', async () => {
    const result = await service.get(user);

    expect(result).toEqual({
      patient: {
        patientReference: 'SCP-AB12-CD34',
        firstName: 'Ada',
        displayName: 'Ada Okafor',
      },
      setup: {
        accountCreated: true,
        profileComplete: true,
        missingProfileFields: [],
        hasProviderConnection: false,
        hasConnectedProvider: false,
        hasCareRequest: false,
        hasHealthCheckBooking: false,
        hasStartedCareJourney: false,
      },
      recommendedAction: PatientDashboardRecommendedAction.NONE,
      recommendedActionDetail: {
        type: PatientDashboardRecommendedAction.NONE,
        resource: null,
        target: { type: PatientDashboardActionTargetType.STAY_WELL },
      },
      dashboardMode: PatientDashboardMode.GETTING_STARTED,
    });
  });

  it('recommends completing the profile using only required V1 identity fields', async () => {
    patients.findOne.mockResolvedValue({ ...patient, familyName: ' ' });
    actions.project.mockResolvedValue({ type: PatientDashboardRecommendedAction.COMPLETE_PROFILE, resource: null, target: { type: PatientDashboardActionTargetType.PROFILE } });
    const result = await service.get(user);

    expect(result.setup).toMatchObject({
      profileComplete: false,
      missingProfileFields: ['familyName'],
    });
    expect(result.recommendedAction).toBe(
      PatientDashboardRecommendedAction.COMPLETE_PROFILE,
    );
  });

  it('reflects profile completion naturally after authoritative profile fields are updated', async () => {
    patients.findOne
      .mockResolvedValueOnce({ ...patient, givenName: ' ' })
      .mockResolvedValueOnce({ ...patient, givenName: 'Ada' });
    actions.project
      .mockResolvedValueOnce({ type: PatientDashboardRecommendedAction.COMPLETE_PROFILE, resource: null, target: { type: PatientDashboardActionTargetType.PROFILE } })
      .mockResolvedValueOnce({ type: PatientDashboardRecommendedAction.NONE, resource: null, target: { type: PatientDashboardActionTargetType.STAY_WELL } });

    const before = await service.get(user);
    const after = await service.get(user);

    expect(before.setup.profileComplete).toBe(false);
    expect(before.recommendedAction).toBe(PatientDashboardRecommendedAction.COMPLETE_PROFILE);
    expect(after.setup.profileComplete).toBe(true);
    expect(after.recommendedAction).toBe(PatientDashboardRecommendedAction.NONE);
  });

  it('recognizes a meaningful in-progress Provider connection and excludes terminal attempts', async () => {
    connections.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    actions.project.mockResolvedValue({ type: PatientDashboardRecommendedAction.VIEW_PROVIDER_CONNECTION, resource: { domain: 'PROVIDER_CONNECTION', reference: 'SC-PC-X' }, target: { type: 'PROVIDER_CONNECTION' } });

    const result = await service.get(user);

    expect(result.setup).toMatchObject({
      hasProviderConnection: true,
      hasConnectedProvider: false,
    });
    expect(result.recommendedAction).toBe(
      PatientDashboardRecommendedAction.VIEW_PROVIDER_CONNECTION,
    );
    expect(connections.exists).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: 'patient-a',
          status: expect.any(Object),
        }),
      }),
    );
    const meaningfulStatuses = connections.exists.mock.calls[0][0].where.status._value;
    expect(meaningfulStatuses).toEqual([
      PatientProviderConnectionStatus.AWAITING_FUNDING,
      PatientProviderConnectionStatus.SUBMITTED,
      PatientProviderConnectionStatus.UNABLE_TO_VERIFY,
      PatientProviderConnectionStatus.CONNECTED,
    ]);
    expect(meaningfulStatuses).not.toContain(PatientProviderConnectionStatus.REJECTED);
    expect(meaningfulStatuses).not.toContain(PatientProviderConnectionStatus.CANCELLED);
  });

  it('does not let a connected Provider create an action when no care journey needs attention', async () => {
    connections.exists.mockResolvedValue(true);

    const result = await service.get(user);

    expect(result.setup.hasConnectedProvider).toBe(true);
    expect(result.recommendedAction).toBe(PatientDashboardRecommendedAction.NONE);
    expect(result.dashboardMode).toBe(PatientDashboardMode.ESTABLISHED);
  });

  it('recommends continuing an active Find Care request without requiring a connection', async () => {
    careRequests.exists.mockResolvedValue(true);
    actions.project.mockResolvedValue({ type: PatientDashboardRecommendedAction.FIND_CARE, resource: { domain: 'CARE_REQUEST', reference: 'SC-CARE-X' }, target: { type: 'FIND_CARE' } });

    const result = await service.get(user);

    expect(result.setup).toMatchObject({
      hasProviderConnection: false,
      hasCareRequest: true,
      hasStartedCareJourney: true,
    });
    expect(result.recommendedAction).toBe(PatientDashboardRecommendedAction.FIND_CARE);
    expect(result.dashboardMode).toBe(PatientDashboardMode.ESTABLISHED);
  });

  it('keeps historical care setup progress without recommending a completed journey', async () => {
    careRequests.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await service.get(user);

    expect(result.setup).toMatchObject({
      hasCareRequest: true,
      hasStartedCareJourney: true,
    });
    expect(result.recommendedAction).toBe(PatientDashboardRecommendedAction.NONE);
  });

  it('does not let a connected Provider override an active Find Care continuation', async () => {
    connections.exists.mockResolvedValue(true);
    careRequests.exists.mockResolvedValue(true);
    actions.project.mockResolvedValue({ type: PatientDashboardRecommendedAction.FIND_CARE, resource: { domain: 'CARE_REQUEST', reference: 'SC-CARE-X' }, target: { type: 'FIND_CARE' } });

    const result = await service.get(user);

    expect(result.setup.hasConnectedProvider).toBe(true);
    expect(result.recommendedAction).toBe(PatientDashboardRecommendedAction.FIND_CARE);
  });

  it('treats a non-draft Health Check booking as a started journey', async () => {
    bookings.exists.mockResolvedValue(true);

    const result = await service.get(user);

    expect(result.setup).toMatchObject({
      hasHealthCheckBooking: true,
      hasStartedCareJourney: true,
    });
    expect(result.dashboardMode).toBe(PatientDashboardMode.ESTABLISHED);
    expect(bookings.exists).toHaveBeenCalledWith({
      where: {
        participantPatientId: 'patient-a',
        status: expect.any(Object),
      },
    });
    expect(bookings.exists.mock.calls[0][0].where.status._value).toBe(BookingStatus.DRAFT);
  });

  it('uses the authenticated patient ownership key for every existence check', async () => {
    await service.get(user);

    expect(patients.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-a' }, withDeleted: true }),
    );
    expect(careRequests.exists).toHaveBeenCalledWith({ where: { patientId: 'patient-a' } });
    expect(bookings.exists).toHaveBeenCalledWith({
      where: {
        participantPatientId: 'patient-a',
        status: expect.any(Object),
      },
    });
  });

  it('does not expose internal, payment, commission, or clinical fields', async () => {
    const result = await service.get(user);
    const serialized = JSON.stringify(result);

    expect(result.patient).not.toHaveProperty('id');
    expect(result.patient).not.toHaveProperty('userId');
    expect(serialized).not.toContain('patient-a');
    expect(serialized).not.toMatch(/payment|commission|diagnosis|clinicalRecord/i);
  });

  it('queries meaningful and connected Provider states separately', async () => {
    await service.get(user);

    expect(connections.exists).toHaveBeenCalledTimes(2);
    expect(connections.exists).toHaveBeenNthCalledWith(2, {
      where: {
        patientId: 'patient-a',
        status: PatientProviderConnectionStatus.CONNECTED,
      },
    });
  });

  it('delegates action selection using the resolved Patient and profile state', async () => {
    await service.get(user);
    expect(actions.project).toHaveBeenCalledWith('patient-a', true);
  });
});
