import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { appConfig } from '../config/app.config';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { HealthResultAccessGrantResponseDto, IssuedHealthResultAccessGrantResponseDto } from './dto/health-result-access-grant.dto';
import { HealthResultResponseDto } from './dto/health-result-response.dto';
import { HealthCheckEncounter } from './entities/health-check-encounter.entity';
import { HealthResultAccessGrant } from './entities/health-result-access-grant.entity';
import { HealthCheckEncounterStatus } from './enums/health-check-encounter-status.enum';
import { HealthResultAccessGrantStatus } from './enums/health-result-access-grant-status.enum';

@Injectable()
export class HealthResultAccessService {
  constructor(
    @InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>,
    @InjectRepository(HealthResultAccessGrant) private readonly grants: Repository<HealthResultAccessGrant>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async getRegisteredResult(user: User, bookingReference: string): Promise<HealthResultResponseDto> {
    const patient = await this.patients.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) this.denyRegistered();
    const encounter = await this.completedResultQuery(this.encounters.manager, patient.id).andWhere('booking.booking_reference = :bookingReference', { bookingReference }).getOne();
    if (!encounter) this.denyRegistered();
    return this.toResult(encounter);
  }

  async issueGuestResultAccess(encounterId: string, actorUserId: string): Promise<IssuedHealthResultAccessGrantResponseDto> {
    const rawToken = randomBytes(32).toString('base64url'); const now = new Date();
    const issued = await this.grants.manager.transaction(async (manager) => {
      const encounter = await manager.getRepository(HealthCheckEncounter).findOne({ where: { id: encounterId }, lock: { mode: 'pessimistic_write' } });
      if (!encounter) throw new NotFoundException('Health check encounter not found');
      if (encounter.status !== HealthCheckEncounterStatus.COMPLETED) throw new ConflictException('Guest result access requires a completed encounter');
      const booking = await manager.getRepository(Booking).findOne({ where: { id: encounter.bookingId } });
      if (!booking) throw new NotFoundException('Health check encounter not found');
      const patient = await manager.getRepository(Patient).findOne({ where: { id: booking.participantPatientId }, withDeleted: true });
      if (!patient || patient.deletedAt) throw new ConflictException('Encounter patient is unavailable');
      if (patient.userId) throw new ConflictException('Registered patients must use authenticated result access');
      const grantRepository = manager.getRepository(HealthResultAccessGrant);
      const existing = await grantRepository.findOne({ where: { encounterId, status: HealthResultAccessGrantStatus.ACTIVE }, lock: { mode: 'pessimistic_write' } });
      if (existing && (!existing.expiresAt || existing.expiresAt > now)) throw new ConflictException('An active guest result-access grant already exists');
      if (existing) { existing.status = HealthResultAccessGrantStatus.EXPIRED; await grantRepository.save(existing); }
      const grant = await grantRepository.save(grantRepository.create({ patientId: patient.id, encounterId, userId: null, accessTokenHash: this.hash(rawToken), status: HealthResultAccessGrantStatus.ACTIVE, expiresAt: new Date(now.getTime() + this.config.healthResults.guestAccessTtlSeconds * 1000), revokedAt: null, lastUsedAt: null, createdByUserId: actorUserId }));
      return { grant, bookingReference: booking.bookingReference };
    });
    return { ...this.grantResponse(issued.grant, issued.bookingReference), resultAccessToken: rawToken };
  }

  async revokeGuestResultAccess(id: string): Promise<HealthResultAccessGrantResponseDto> {
    await this.grants.manager.transaction(async (manager) => {
      const repository = manager.getRepository(HealthResultAccessGrant); const grant = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!grant) throw new NotFoundException('Health result-access grant not found');
      if (grant.status !== HealthResultAccessGrantStatus.ACTIVE) throw new ConflictException('Only an active result-access grant can be revoked');
      grant.status = HealthResultAccessGrantStatus.REVOKED; grant.revokedAt = new Date(); await repository.save(grant);
    });
    const grant = await this.grants.findOne({ where: { id }, relations: { encounter: { booking: true } } });
    if (!grant) throw new NotFoundException('Health result-access grant not found');
    return this.grantResponse(grant, grant.encounter.booking.bookingReference);
  }

  async getGuestResult(token: string): Promise<HealthResultResponseDto> {
    const result = await this.grants.manager.transaction(async (manager) => {
      const repository = manager.getRepository(HealthResultAccessGrant); const grant = await repository.findOne({ where: { accessTokenHash: this.hash(token) }, lock: { mode: 'pessimistic_write' } });
      if (!grant || grant.status !== HealthResultAccessGrantStatus.ACTIVE || grant.revokedAt) return null;
      if (grant.expiresAt && grant.expiresAt <= new Date()) { grant.status = HealthResultAccessGrantStatus.EXPIRED; await repository.save(grant); return null; }
      const encounter = await this.completedResultQuery(manager, grant.patientId).andWhere('encounter.id = :encounterId', { encounterId: grant.encounterId }).getOne();
      if (!encounter) return null;
      grant.lastUsedAt = new Date(); await repository.save(grant); return this.toResult(encounter);
    });
    if (!result) this.denyGuest();
    return result;
  }

  async resolveGuestOwnershipProof(token: string): Promise<string> {
    const patientId = await this.grants.manager.transaction(async (manager) => {
      const repository = manager.getRepository(HealthResultAccessGrant); const grant = await repository.findOne({ where: { accessTokenHash: this.hash(token) }, lock: { mode: 'pessimistic_write' } });
      if (!grant || grant.status !== HealthResultAccessGrantStatus.ACTIVE || grant.revokedAt) return null;
      if (grant.expiresAt && grant.expiresAt <= new Date()) { grant.status = HealthResultAccessGrantStatus.EXPIRED; await repository.save(grant); return null; }
      const encounter = await this.completedResultQuery(manager, grant.patientId).andWhere('encounter.id = :encounterId', { encounterId: grant.encounterId }).getOne();
      if (!encounter) return null;
      grant.lastUsedAt = new Date(); await repository.save(grant); return grant.patientId;
    });
    if (!patientId) this.denyGuest();
    return patientId;
  }

  private completedResultQuery(manager: EntityManager, patientId: string) {
    return manager.getRepository(HealthCheckEncounter).createQueryBuilder('encounter').innerJoinAndSelect('encounter.booking', 'booking').innerJoinAndSelect('booking.healthCheckPackage', 'package').innerJoinAndSelect('encounter.provider', 'provider').leftJoinAndSelect('encounter.measurements', 'measurement').where('booking.participant_patient_id = :patientId', { patientId }).andWhere('encounter.status = :completed', { completed: HealthCheckEncounterStatus.COMPLETED }).orderBy('measurement.code', 'ASC');
  }
  private toResult(encounter: HealthCheckEncounter): HealthResultResponseDto { return { bookingReference: encounter.booking.bookingReference, completedAt: encounter.completedAt!, healthCheckPackage: { code: encounter.booking.healthCheckPackage.code, name: encounter.booking.healthCheckPackage.name }, provider: encounter.provider ? { displayName: encounter.provider.displayName } : null, measurements: encounter.measurements.map((measurement) => ({ code: measurement.code, value: Number(measurement.valueNumeric), secondaryValue: measurement.valueSecondaryNumeric === null ? null : Number(measurement.valueSecondaryNumeric), unit: measurement.unit, recordedAt: measurement.recordedAt })) }; }
  private grantResponse(grant: HealthResultAccessGrant, bookingReference: string): HealthResultAccessGrantResponseDto { return { id: grant.id, bookingReference, status: grant.status, expiresAt: grant.expiresAt, revokedAt: grant.revokedAt, createdAt: grant.createdAt }; }
  private hash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private denyRegistered(): never { throw new NotFoundException('Completed health check result was not found for the authenticated patient'); }
  private denyGuest(): never { throw new NotFoundException('Health result access is invalid or unavailable'); }
}
