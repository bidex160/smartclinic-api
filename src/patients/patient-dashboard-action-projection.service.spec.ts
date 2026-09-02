import {
  PatientDashboardActionResourceDomain,
  PatientDashboardActionTargetType,
  PatientDashboardRecommendedAction,
} from './dto/patient-dashboard.dto';
import { PatientDashboardActionProjectionService } from './patient-dashboard-action-projection.service';

describe('PatientDashboardActionProjectionService', () => {
  const marker = (sql: string) => /dashboard:([a-z-]+)/.exec(sql)?.[1] ?? '';
  let rows: Record<string, Array<{ reference: string; occurredAt: string }>>;
  let query: jest.Mock;
  let service: PatientDashboardActionProjectionService;

  beforeEach(() => {
    rows = {};
    query = jest.fn(async (sql: string) => rows[marker(sql)] ?? []);
    service = new PatientDashboardActionProjectionService({ query } as never);
  });

  const set = (name: string, reference: string, occurredAt = '2026-09-02T10:00:00.000Z') => {
    rows[name] = [{ reference, occurredAt }];
  };

  const expectResource = (result: Awaited<ReturnType<typeof service.project>>, type: PatientDashboardRecommendedAction, domain: PatientDashboardActionResourceDomain, reference: string, target: PatientDashboardActionTargetType) => {
    expect(result).toEqual({ type, resource: { domain, reference }, target: { type: target } });
    expect(JSON.stringify(result)).not.toMatch(/(^|[^a-z])id([^a-z]|$)|gateway|accessCode|checkoutUrl|providerReference/i);
  };

  describe('approved precedence', () => {
    it('puts today appointment before incomplete profile', async () => {
      set('today-appointment', 'SC-APT-TODAY');
      expectResource(await service.project('patient', false), PatientDashboardRecommendedAction.VIEW_APPOINTMENT, PatientDashboardActionResourceDomain.CARE_APPOINTMENT, 'SC-APT-TODAY', PatientDashboardActionTargetType.CARE_APPOINTMENT);
    });

    it('puts incomplete profile before payment', async () => {
      set('health-check-payment', 'SC-BOOK-PAY');
      expect(await service.project('patient', false)).toEqual({ type: PatientDashboardRecommendedAction.COMPLETE_PROFILE, resource: null, target: { type: PatientDashboardActionTargetType.PROFILE } });
    });

    it('puts payment before a resumable Self-Check', async () => {
      set('care-request-payment', 'SC-CARE-PAY'); set('continue-self-check', 'SC-GSC-CONTINUE');
      expectResource(await service.project('patient', true), PatientDashboardRecommendedAction.COMPLETE_PAYMENT, PatientDashboardActionResourceDomain.CARE_REQUEST, 'SC-CARE-PAY', PatientDashboardActionTargetType.PAYMENT);
    });

    it('puts Self-Check before Health Check viewing', async () => {
      set('continue-self-check', 'SC-GSC-CONTINUE'); set('view-health-check', 'SC-BOOK-VIEW');
      expect((await service.project('patient', true)).type).toBe(PatientDashboardRecommendedAction.CONTINUE_SELF_CHECK);
    });

    it('puts Health Check viewing before Find Care and connection tracking', async () => {
      set('view-health-check', 'SC-BOOK-VIEW'); set('find-care', 'SC-CARE-RECOVER'); set('view-provider-connection', 'SC-PC-TRACK');
      expect((await service.project('patient', true)).type).toBe(PatientDashboardRecommendedAction.VIEW_HEALTH_CHECK);
    });

    it('puts genuine Find Care recovery before connection tracking', async () => {
      set('find-care', 'SC-CARE-RECOVER'); set('view-provider-connection', 'SC-PC-TRACK');
      expect((await service.project('patient', true)).type).toBe(PatientDashboardRecommendedAction.FIND_CARE);
    });

    it('returns a resource-free neutral action', async () => {
      expect(await service.project('patient', true)).toEqual({ type: PatientDashboardRecommendedAction.NONE, resource: null, target: { type: PatientDashboardActionTargetType.STAY_WELL } });
    });
  });

  describe('appointment query', () => {
    it.each(['SCHEDULED', 'CONFIRMED'])('uses patient-visible %s appointments', async (status) => {
      set('today-appointment', `SC-APT-${status}`);
      const result = await service.project('patient', true);
      expect(result.type).toBe(PatientDashboardRecommendedAction.VIEW_APPOINTMENT);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'today-appointment')[0];
      expect(sql).toContain("status IN ('SCHEDULED', 'CONFIRMED')");
    });

    it('evaluates local today and still-current time in the persisted IANA timezone', async () => {
      await service.project('patient', true);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'today-appointment')[0];
      expect(sql).toContain('CURRENT_TIMESTAMP AT TIME ZONE timezone');
      expect(sql).toContain('scheduled_date + scheduled_time_to');
    });

    it('excludes future and terminal appointments in SQL and orders earliest with stable ties', async () => {
      await service.project('patient', true);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'today-appointment')[0];
      expect(sql).not.toMatch(/COMPLETED|CANCELLED|NO_SHOW|IN_PROGRESS/);
      expect(sql).toContain('ORDER BY scheduled_time_from ASC, created_at ASC, reference ASC');
      expect(sql).toContain('LIMIT 1');
    });
  });

  describe('payment actionability', () => {
    it.each([
      ['self-check-payment', PatientDashboardActionResourceDomain.GUIDED_SELF_CHECK, 'SC-GSC-PAY'],
      ['health-check-payment', PatientDashboardActionResourceDomain.HEALTH_CHECK, 'SC-BOOK-PAY'],
      ['care-request-payment', PatientDashboardActionResourceDomain.CARE_REQUEST, 'SC-CARE-PAY'],
      ['connection-payment', PatientDashboardActionResourceDomain.PROVIDER_CONNECTION, 'SC-PC-PAY'],
    ])('binds %s to its public parent resource', async (name, domain, reference) => {
      set(name, reference);
      expectResource(await service.project('patient', true), PatientDashboardRecommendedAction.COMPLETE_PAYMENT, domain, reference, PatientDashboardActionTargetType.PAYMENT);
    });

    it('allows no attempt, usable CREATED, awaiting customer, failed, and cancelled states', async () => {
      await service.project('patient', true);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'health-check-payment')[0];
      expect(sql).toContain('attempt.id IS NULL');
      expect(sql).toContain("attempt.status = 'CREATED'");
      expect(sql).toContain('attempt.checkout_url IS NOT NULL OR attempt.access_code IS NOT NULL');
      expect(sql).toContain("'AWAITING_CUSTOMER_ACTION', 'FAILED', 'CANCELLED'");
    });

    it('does not accept pending confirmation or succeeded attempts as payment actions', async () => {
      await service.project('patient', true);
      for (const call of query.mock.calls.filter(([sql]) => marker(sql).endsWith('payment'))) {
        expect(call[0]).not.toMatch(/attempt\.status IN \([^)]*PENDING_CONFIRMATION/);
        expect(call[0]).not.toMatch(/attempt\.status IN \([^)]*SUCCEEDED/);
      }
    });

    it('uses only the latest attempt and deterministic parent ordering', async () => {
      await service.project('patient', true);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'health-check-payment')[0];
      expect(sql).toContain('ORDER BY attempt.created_at DESC, attempt.id DESC LIMIT 1');
      expect(sql).toContain('ORDER BY booking.updated_at DESC, booking.booking_reference DESC LIMIT 1');
    });

    it('selects the most recently updated payment obligation across domains with a stable domain tie-break', async () => {
      set('self-check-payment', 'SC-GSC-OLD', '2026-09-01T10:00:00Z');
      set('health-check-payment', 'SC-BOOK-NEW', '2026-09-02T10:00:00Z');
      expectResource(await service.project('patient', true), PatientDashboardRecommendedAction.COMPLETE_PAYMENT, PatientDashboardActionResourceDomain.HEALTH_CHECK, 'SC-BOOK-NEW', PatientDashboardActionTargetType.PAYMENT);
    });

    it('restricts each parent to its authoritative payable state', async () => {
      await service.project('patient', true);
      const sql = Object.fromEntries(query.mock.calls.map(([value]) => [marker(value), value]));
      expect(sql['self-check-payment']).toContain("funding_status IN ('UNPAID', 'PAYMENT_PENDING')");
      expect(sql['health-check-payment']).toContain("booking.status IN ('DRAFT', 'AWAITING_FUNDING')");
      expect(sql['care-request-payment']).toContain("request.status = 'PROVIDER_ACCEPTED'");
      expect(sql['connection-payment']).toContain("connection.status = 'AWAITING_FUNDING'");
    });
  });

  describe('domain candidates', () => {
    it('continues only funded not-started or in-progress Self-Checks', async () => {
      set('continue-self-check', 'SC-GSC-X');
      expectResource(await service.project('patient', true), PatientDashboardRecommendedAction.CONTINUE_SELF_CHECK, PatientDashboardActionResourceDomain.GUIDED_SELF_CHECK, 'SC-GSC-X', PatientDashboardActionTargetType.GUIDED_SELF_CHECK);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'continue-self-check')[0];
      expect(sql).toContain("workflow_status = 'NOT_STARTED'");
      expect(sql).toContain("funding_status IN ('PAID', 'SATISFIED_FREE')");
      expect(sql).toContain("workflow_status = 'IN_PROGRESS'");
      expect(sql).not.toContain("workflow_status = 'COMPLETED'");
    });

    it('selects the most recently progressed Self-Check with a stable reference tie-break', async () => {
      await service.project('patient', true);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'continue-self-check')[0];
      expect(sql).toContain('ORDER BY COALESCE(started_at, updated_at, created_at) DESC, reference DESC LIMIT 1');
    });

    it('views assigned, scheduled, or unfulfillable Health Checks but not matching or terminal bookings', async () => {
      set('view-health-check', 'SC-BOOK-X');
      expect((await service.project('patient', true)).type).toBe(PatientDashboardRecommendedAction.VIEW_HEALTH_CHECK);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'view-health-check')[0];
      expect(sql).toContain("status IN ('PROVIDER_ASSIGNED', 'SCHEDULED', 'UNFULFILLABLE')");
      expect(sql).not.toMatch(/PENDING_PROVIDER_MATCH|COMPLETED|CANCELLED|EXPIRED/);
    });

    it('prioritizes scheduled Health Checks within the domain and uses stable recency ties', async () => {
      await service.project('patient', true);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'view-health-check')[0];
      expect(sql).toContain("CASE WHEN status = 'SCHEDULED' THEN 0");
      expect(sql).toContain('scheduled_starts_at ASC NULLS LAST, updated_at DESC, booking_reference DESC LIMIT 1');
    });

    it('uses only declined or unfulfillable Care Requests as safe restart/recovery destinations', async () => {
      set('find-care', 'SC-CARE-X');
      expect((await service.project('patient', true)).type).toBe(PatientDashboardRecommendedAction.FIND_CARE);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'find-care')[0];
      expect(sql).toContain("status IN ('DECLINED', 'UNFULFILLABLE')");
      expect(sql).not.toMatch(/MATCHING|AWAITING_PROVIDER_RESPONSE|IN_PROGRESS|SCHEDULED/);
    });

    it('tracks submitted connections and prioritizes unable-to-verify recovery', async () => {
      set('view-provider-connection', 'SC-PC-X');
      expect((await service.project('patient', true)).type).toBe(PatientDashboardRecommendedAction.VIEW_PROVIDER_CONNECTION);
      const sql = query.mock.calls.find(([value]) => marker(value) === 'view-provider-connection')[0];
      expect(sql).toContain("status IN ('UNABLE_TO_VERIFY', 'SUBMITTED')");
      expect(sql).toContain("CASE WHEN status = 'UNABLE_TO_VERIFY' THEN 0 ELSE 1 END");
      expect(sql).not.toMatch(/CONNECTED|REJECTED|CANCELLED/);
    });

    it('never emits CONNECT_PROVIDER for a missing connection', async () => {
      expect((await service.project('patient', true)).type).toBe(PatientDashboardRecommendedAction.NONE);
    });
  });

  it('runs exactly nine bounded patient-scoped candidate queries', async () => {
    await service.project('patient-1', true);
    expect(query).toHaveBeenCalledTimes(9);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('LIMIT 1');
      expect(params).toEqual(['patient-1']);
    }
  });
});
