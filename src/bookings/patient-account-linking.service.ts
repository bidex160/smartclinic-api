import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { HealthResultAccessGrant } from '../health-checks/entities/health-result-access-grant.entity';
import { HealthResultAccessGrantStatus } from '../health-checks/enums/health-result-access-grant-status.enum';
import { HealthResultAccessService } from '../health-checks/health-result-access.service';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { PatientAccountLinkResponseDto } from './dto/patient-account-link-response.dto';
import { PublicBookingSessionService } from './public-booking-session.service';

@Injectable()
export class PatientAccountLinkingService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly bookingSessions: PublicBookingSessionService,
    private readonly resultAccess: HealthResultAccessService,
  ) {}

  async linkFromBooking(user: User, bookingReference: string, sessionToken: string | null): Promise<PatientAccountLinkResponseDto> {
    const patientId = await this.bookingSessions.resolvePatientOwnershipProof(sessionToken, bookingReference);
    return this.link(user.id, patientId);
  }

  async linkFromResult(user: User, resultAccessToken: string): Promise<PatientAccountLinkResponseDto> {
    const patientId = await this.resultAccess.resolveGuestOwnershipProof(resultAccessToken);
    return this.link(user.id, patientId);
  }

  private async link(userId: string, patientId: string): Promise<PatientAccountLinkResponseDto> {
    try {
      return await this.patients.manager.transaction(async (manager) => {
        const userRepository = manager.getRepository(User); const patientRepository = manager.getRepository(Patient); const grantRepository = manager.getRepository(HealthResultAccessGrant);
        const user = await userRepository.findOne({ where: { id: userId }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
        if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Authentication is required');
        const target = await patientRepository.findOne({ where: { id: patientId }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
        if (!target || target.deletedAt || target.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient ownership proof is unavailable');
        const current = await patientRepository.findOne({ where: { userId }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
        if (current && current.id !== target.id) throw new ConflictException('The authenticated account is already linked to a different Patient');
        if (target.userId && target.userId !== userId) throw new ConflictException('The Patient is already linked to another account');
        if (!target.userId) { target.userId = userId; await patientRepository.save(target); }
        await grantRepository.update({ patientId: target.id, status: HealthResultAccessGrantStatus.ACTIVE }, { status: HealthResultAccessGrantStatus.REVOKED, revokedAt: new Date() });
        return { linked: true, patient: { givenName: target.givenName, familyName: target.familyName } };
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') throw new ConflictException('The Patient or account was linked concurrently');
      throw error;
    }
  }
}
