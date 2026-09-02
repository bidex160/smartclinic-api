import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PatientDashboardActionResourceDomain,
  PatientDashboardActionTargetType,
  PatientDashboardRecommendedAction,
  PatientDashboardRecommendedActionDetailDto,
} from './dto/patient-dashboard.dto';

interface Candidate {
  type: PatientDashboardRecommendedAction;
  domain: PatientDashboardActionResourceDomain;
  reference: string;
  target: PatientDashboardActionTargetType;
  occurredAt: Date;
}

interface CandidateRow { reference: string; occurredAt: Date | string; }

const ACTIONABLE_ATTEMPT = `(
  attempt.id IS NULL
  OR (attempt.status = 'CREATED' AND (attempt.checkout_url IS NOT NULL OR attempt.access_code IS NOT NULL))
  OR attempt.status IN ('AWAITING_CUSTOMER_ACTION', 'FAILED', 'CANCELLED')
)`;

@Injectable()
export class PatientDashboardActionProjectionService {
  constructor(private readonly dataSource: DataSource) {}

  async project(patientId: string, profileComplete: boolean): Promise<PatientDashboardRecommendedActionDetailDto> {
    const appointment = await this.todayAppointment(patientId);
    if (appointment) return this.detail(appointment);
    if (!profileComplete) return this.withoutResource(PatientDashboardRecommendedAction.COMPLETE_PROFILE, PatientDashboardActionTargetType.PROFILE);

    const [selfCheckPayment, healthCheckPayment, carePayment, connectionPayment, selfCheck, healthCheck, care, connection] =
      await Promise.all([
        this.selfCheckPayment(patientId),
        this.healthCheckPayment(patientId),
        this.careRequestPayment(patientId),
        this.connectionPayment(patientId),
        this.selfCheck(patientId),
        this.healthCheck(patientId),
        this.careRequest(patientId),
        this.connection(patientId),
      ]);

    const payment = this.latest([selfCheckPayment, healthCheckPayment, carePayment, connectionPayment]);
    if (payment) return this.detail(payment);
    if (selfCheck) return this.detail(selfCheck);
    if (healthCheck) return this.detail(healthCheck);
    if (care) return this.detail(care);
    if (connection) return this.detail(connection);
    return this.withoutResource(PatientDashboardRecommendedAction.NONE, PatientDashboardActionTargetType.STAY_WELL);
  }

  private async todayAppointment(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:today-appointment */
      SELECT reference, created_at AS "occurredAt"
      FROM care_appointments
      WHERE patient_id = $1
        AND status IN ('SCHEDULED', 'CONFIRMED')
        AND scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date
        AND (scheduled_date + scheduled_time_to) >= (CURRENT_TIMESTAMP AT TIME ZONE timezone)
      ORDER BY scheduled_time_from ASC, created_at ASC, reference ASC
      LIMIT 1`, patientId);
    return this.candidate(row, PatientDashboardRecommendedAction.VIEW_APPOINTMENT, PatientDashboardActionResourceDomain.CARE_APPOINTMENT, PatientDashboardActionTargetType.CARE_APPOINTMENT);
  }

  private async selfCheckPayment(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:self-check-payment */
      SELECT check_row.reference, check_row.updated_at AS "occurredAt"
      FROM guided_self_checks check_row
      LEFT JOIN LATERAL (
        SELECT attempt.* FROM payment_attempts attempt
        WHERE attempt.guided_self_check_id = check_row.id
        ORDER BY attempt.created_at DESC, attempt.id DESC LIMIT 1
      ) attempt ON true
      WHERE check_row.patient_id = $1
        AND check_row.workflow_status = 'NOT_STARTED'
        AND check_row.funding_status IN ('UNPAID', 'PAYMENT_PENDING')
        AND ${ACTIONABLE_ATTEMPT}
      ORDER BY check_row.updated_at DESC, check_row.reference DESC LIMIT 1`, patientId);
    return this.payment(row, PatientDashboardActionResourceDomain.GUIDED_SELF_CHECK);
  }

  private async healthCheckPayment(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:health-check-payment */
      SELECT booking.booking_reference AS reference, booking.updated_at AS "occurredAt"
      FROM bookings booking
      LEFT JOIN booking_funding funding ON funding.booking_id = booking.id AND funding.source_type = 'SELF'
      LEFT JOIN LATERAL (
        SELECT attempt.* FROM payment_attempts attempt
        WHERE attempt.booking_funding_id = funding.id
        ORDER BY attempt.created_at DESC, attempt.id DESC LIMIT 1
      ) attempt ON true
      WHERE booking.participant_patient_id = $1
        AND booking.status IN ('DRAFT', 'AWAITING_FUNDING')
        AND (funding.id IS NULL OR funding.status = 'PENDING')
        AND ${ACTIONABLE_ATTEMPT}
      ORDER BY booking.updated_at DESC, booking.booking_reference DESC LIMIT 1`, patientId);
    return this.payment(row, PatientDashboardActionResourceDomain.HEALTH_CHECK);
  }

  private async careRequestPayment(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:care-request-payment */
      SELECT request.reference, request.updated_at AS "occurredAt"
      FROM care_requests request
      LEFT JOIN care_request_funding funding ON funding.care_request_id = request.id
      LEFT JOIN LATERAL (
        SELECT attempt.* FROM payment_attempts attempt
        WHERE attempt.care_request_funding_id = funding.id
        ORDER BY attempt.created_at DESC, attempt.id DESC LIMIT 1
      ) attempt ON true
      WHERE request.patient_id = $1
        AND request.status = 'PROVIDER_ACCEPTED'
        AND request.service_price_minor > 0
        AND (funding.id IS NULL OR funding.status = 'PENDING')
        AND ${ACTIONABLE_ATTEMPT}
      ORDER BY request.updated_at DESC, request.reference DESC LIMIT 1`, patientId);
    return this.payment(row, PatientDashboardActionResourceDomain.CARE_REQUEST);
  }

  private async connectionPayment(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:connection-payment */
      SELECT connection.reference, connection.updated_at AS "occurredAt"
      FROM patient_provider_connections connection
      JOIN patient_provider_connection_funding funding ON funding.connection_id = connection.id AND funding.status = 'PENDING'
      LEFT JOIN LATERAL (
        SELECT attempt.* FROM payment_attempts attempt
        WHERE attempt.patient_provider_connection_funding_id = funding.id
        ORDER BY attempt.created_at DESC, attempt.id DESC LIMIT 1
      ) attempt ON true
      WHERE connection.patient_id = $1
        AND connection.status = 'AWAITING_FUNDING'
        AND ${ACTIONABLE_ATTEMPT}
      ORDER BY connection.updated_at DESC, connection.reference DESC LIMIT 1`, patientId);
    return this.payment(row, PatientDashboardActionResourceDomain.PROVIDER_CONNECTION);
  }

  private async selfCheck(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:continue-self-check */
      SELECT reference, COALESCE(started_at, updated_at, created_at) AS "occurredAt"
      FROM guided_self_checks
      WHERE patient_id = $1
        AND ((workflow_status = 'NOT_STARTED' AND funding_status IN ('PAID', 'SATISFIED_FREE')) OR workflow_status = 'IN_PROGRESS')
      ORDER BY COALESCE(started_at, updated_at, created_at) DESC, reference DESC LIMIT 1`, patientId);
    return this.candidate(row, PatientDashboardRecommendedAction.CONTINUE_SELF_CHECK, PatientDashboardActionResourceDomain.GUIDED_SELF_CHECK, PatientDashboardActionTargetType.GUIDED_SELF_CHECK);
  }

  private async healthCheck(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:view-health-check */
      SELECT booking_reference AS reference, COALESCE(scheduled_starts_at, updated_at, created_at) AS "occurredAt"
      FROM bookings
      WHERE participant_patient_id = $1
        AND status IN ('PROVIDER_ASSIGNED', 'SCHEDULED', 'UNFULFILLABLE')
      ORDER BY CASE WHEN status = 'SCHEDULED' THEN 0 WHEN status = 'UNFULFILLABLE' THEN 1 ELSE 2 END,
        scheduled_starts_at ASC NULLS LAST, updated_at DESC, booking_reference DESC LIMIT 1`, patientId);
    return this.candidate(row, PatientDashboardRecommendedAction.VIEW_HEALTH_CHECK, PatientDashboardActionResourceDomain.HEALTH_CHECK, PatientDashboardActionTargetType.HEALTH_CHECK);
  }

  private async careRequest(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:find-care */
      SELECT reference, updated_at AS "occurredAt"
      FROM care_requests
      WHERE patient_id = $1 AND status IN ('DECLINED', 'UNFULFILLABLE')
      ORDER BY updated_at DESC, reference DESC LIMIT 1`, patientId);
    return this.candidate(row, PatientDashboardRecommendedAction.FIND_CARE, PatientDashboardActionResourceDomain.CARE_REQUEST, PatientDashboardActionTargetType.FIND_CARE);
  }

  private async connection(patientId: string): Promise<Candidate | null> {
    const row = await this.one(`/* dashboard:view-provider-connection */
      SELECT reference, updated_at AS "occurredAt"
      FROM patient_provider_connections
      WHERE patient_id = $1 AND status IN ('UNABLE_TO_VERIFY', 'SUBMITTED')
      ORDER BY CASE WHEN status = 'UNABLE_TO_VERIFY' THEN 0 ELSE 1 END, updated_at DESC, reference DESC LIMIT 1`, patientId);
    return this.candidate(row, PatientDashboardRecommendedAction.VIEW_PROVIDER_CONNECTION, PatientDashboardActionResourceDomain.PROVIDER_CONNECTION, PatientDashboardActionTargetType.PROVIDER_CONNECTION);
  }

  private async one(sql: string, patientId: string): Promise<CandidateRow | null> {
    const rows = await this.dataSource.query<CandidateRow[]>(sql, [patientId]);
    return rows[0] ?? null;
  }

  private payment(row: CandidateRow | null, domain: PatientDashboardActionResourceDomain) {
    return this.candidate(row, PatientDashboardRecommendedAction.COMPLETE_PAYMENT, domain, PatientDashboardActionTargetType.PAYMENT);
  }

  private candidate(row: CandidateRow | null, type: PatientDashboardRecommendedAction, domain: PatientDashboardActionResourceDomain, target: PatientDashboardActionTargetType): Candidate | null {
    return row ? { type, domain, reference: row.reference, target, occurredAt: new Date(row.occurredAt) } : null;
  }

  private latest(values: Array<Candidate | null>): Candidate | null {
    return values.filter((value): value is Candidate => Boolean(value)).sort((left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime()
      || left.domain.localeCompare(right.domain)
      || right.reference.localeCompare(left.reference))[0] ?? null;
  }

  private detail(candidate: Candidate): PatientDashboardRecommendedActionDetailDto {
    return { type: candidate.type, resource: { domain: candidate.domain, reference: candidate.reference }, target: { type: candidate.target } };
  }

  private withoutResource(type: PatientDashboardRecommendedAction, target: PatientDashboardActionTargetType): PatientDashboardRecommendedActionDetailDto {
    return { type, resource: null, target: { type: target } };
  }
}
