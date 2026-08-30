import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';

import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { PatientProviderConnection } from '../patient-provider-connections/entities/patient-provider-connection.entity';
import { PatientProviderConnectionStatus } from '../patient-provider-connections/enums/patient-provider-connection-status.enum';
import { User } from '../users/entities/user.entity';
import {
  PatientDashboardDto,
  PatientDashboardMode,
  PatientDashboardRecommendedAction,
} from './dto/patient-dashboard.dto';
import { Patient } from './entities/patient.entity';
import { PatientStatus } from './enums/patient-status.enum';

const MEANINGFUL_CONNECTION_STATUSES = [
  PatientProviderConnectionStatus.AWAITING_FUNDING,
  PatientProviderConnectionStatus.SUBMITTED,
  PatientProviderConnectionStatus.UNABLE_TO_VERIFY,
  PatientProviderConnectionStatus.CONNECTED,
];

type ProfileField = 'givenName' | 'familyName';

@Injectable()
export class PatientDashboardService {
  constructor(
    @InjectRepository(Patient)
    private readonly patients: Repository<Patient>,
    @InjectRepository(PatientProviderConnection)
    private readonly connections: Repository<PatientProviderConnection>,
    @InjectRepository(CareRequest)
    private readonly careRequests: Repository<CareRequest>,
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
  ) {}

  async get(user: User): Promise<PatientDashboardDto> {
    const patient = await this.patients.findOne({
      select: {
        id: true,
        patientReference: true,
        givenName: true,
        familyName: true,
        status: true,
        deletedAt: true,
      },
      where: { userId: user.id },
      withDeleted: true,
    });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) {
      throw new NotFoundException('Patient profile was not found for the authenticated user');
    }

    const [hasProviderConnection, hasConnectedProvider, hasCareRequest, hasHealthCheckBooking] =
      await Promise.all([
        this.connections.exists({
          where: {
            patientId: patient.id,
            status: In(MEANINGFUL_CONNECTION_STATUSES),
          },
        }),
        this.connections.exists({
          where: {
            patientId: patient.id,
            status: PatientProviderConnectionStatus.CONNECTED,
          },
        }),
        this.careRequests.exists({ where: { patientId: patient.id } }),
        this.bookings.exists({
          where: {
            participantPatientId: patient.id,
            status: Not(BookingStatus.DRAFT),
          },
        }),
      ]);

    const missingProfileFields = this.missingProfileFields(patient);
    const profileComplete = missingProfileFields.length === 0;
    const hasStartedCareJourney = hasCareRequest || hasHealthCheckBooking;

    return {
      patient: {
        patientReference: patient.patientReference,
        firstName: patient.givenName,
        displayName: [patient.givenName, patient.familyName].filter(Boolean).join(' '),
      },
      setup: {
        accountCreated: true,
        profileComplete,
        missingProfileFields,
        hasProviderConnection,
        hasConnectedProvider,
        hasCareRequest,
        hasHealthCheckBooking,
        hasStartedCareJourney,
      },
      recommendedAction: this.recommendedAction({
        profileComplete,
        hasProviderConnection,
        hasConnectedProvider,
        hasStartedCareJourney,
      }),
      dashboardMode:
        hasStartedCareJourney || hasConnectedProvider
          ? PatientDashboardMode.ESTABLISHED
          : PatientDashboardMode.GETTING_STARTED,
    };
  }

  private missingProfileFields(patient: Pick<Patient, ProfileField>): ProfileField[] {
    const missing: ProfileField[] = [];
    if (!patient.givenName.trim()) missing.push('givenName');
    if (!patient.familyName.trim()) missing.push('familyName');
    return missing;
  }

  private recommendedAction(input: {
    profileComplete: boolean;
    hasProviderConnection: boolean;
    hasConnectedProvider: boolean;
    hasStartedCareJourney: boolean;
  }): PatientDashboardRecommendedAction {
    if (!input.profileComplete) return PatientDashboardRecommendedAction.COMPLETE_PROFILE;
    if (!input.hasProviderConnection && !input.hasStartedCareJourney) {
      return PatientDashboardRecommendedAction.CONNECT_PROVIDER;
    }
    if (input.hasProviderConnection && !input.hasConnectedProvider) {
      return PatientDashboardRecommendedAction.VIEW_PROVIDER_CONNECTION;
    }
    if (!input.hasStartedCareJourney) return PatientDashboardRecommendedAction.FIND_CARE;
    return PatientDashboardRecommendedAction.NONE;
  }
}
