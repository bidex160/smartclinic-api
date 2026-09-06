import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { CreateDependantDto, DependantResponseDto } from './dto/dependant.dto';
import { DependantRewardProvenance } from './entities/dependant-reward-provenance.entity';
import { Patient } from './entities/patient.entity';
import { PatientRelationship } from './entities/patient-relationship.entity';
import { DependantRewardQualificationStatus, PatientRelationshipRole, PatientRelationshipStatus } from './enums/patient-relationship.enum';
import { PatientStatus } from './enums/patient-status.enum';
import { generatePatientReference, isPatientReferenceCollision, MAX_PATIENT_REFERENCE_GENERATION_ATTEMPTS } from './patient-reference';
import { PatientAccessService } from './patient-access.service';

@Injectable()
export class DependantsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientRelationship) private readonly relationships: Repository<PatientRelationship>,
    private readonly access: PatientAccessService,
  ) {}

  async create(actor: User, dto: CreateDependantDto): Promise<DependantResponseDto> {
    if (actor.deletedAt || actor.status !== UserStatus.ACTIVE || !actor.roles.includes(UserRole.USER)) throw new NotFoundException('Patient account was not found');
    if (dto.dateOfBirth > new Date().toISOString().slice(0, 10)) throw new BadRequestException('dateOfBirth cannot be in the future');
    for (let attempt = 0; attempt < MAX_PATIENT_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.patients.manager.transaction(async manager => {
          const currentActor = await manager.getRepository(User).findOne({ where: { id: actor.id, status: UserStatus.ACTIVE }, withDeleted: true, lock: { mode: 'pessimistic_read' } });
          if (!currentActor || currentActor.deletedAt || !currentActor.roles.includes(UserRole.USER)) throw new NotFoundException('Patient account was not found');
          const patient = await manager.getRepository(Patient).save(manager.getRepository(Patient).create({
            patientReference: generatePatientReference(), userId: null, givenName: dto.firstName, familyName: dto.lastName,
            dateOfBirth: dto.dateOfBirth, email: null, phone: null, countryCode: dto.countryCode,
            stateOrRegion: dto.stateOrRegion, city: dto.city, status: PatientStatus.ACTIVE,
          }));
          const relationship = await manager.getRepository(PatientRelationship).save(manager.getRepository(PatientRelationship).create({
            relatedUserId: actor.id, patientId: patient.id, relationshipType: dto.relationshipType,
            role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE, isPrimary: true, endedAt: null,
          }));
          await manager.getRepository(DependantRewardProvenance).save(manager.getRepository(DependantRewardProvenance).create({
            dependantPatientId: patient.id, createdByUserId: actor.id, status: DependantRewardQualificationStatus.PENDING,
            qualifyingCareSource: null, qualifyingCareReference: null, qualifiedAt: null, rewardCreditedAt: null,
          }));
          return { patient, relationship };
        });
        return this.project(result.patient, result.relationship);
      } catch (error) {
        if (isPatientReferenceCollision(error) && attempt < MAX_PATIENT_REFERENCE_GENERATION_ATTEMPTS - 1) continue;
        if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505') throw new ConflictException('Dependant relationship already exists');
        throw error;
      }
    }
    throw new ConflictException('Unable to generate a unique patient reference');
  }

  async list(actor: User): Promise<{ items: DependantResponseDto[] }> {
    const accessible = await this.access.listAccessiblePatients(actor.id);
    return { items: accessible.filter(item => item.accessKind === 'DEPENDANT').map(item => ({
      patientReference: item.patientReference, firstName: item.firstName, lastName: item.lastName, displayName: item.displayName,
      dateOfBirth: item.dateOfBirth!, countryCode: item.countryCode!, stateOrRegion: item.stateOrRegion!, city: item.city!, relationship: item.relationship!,
    })) };
  }

  async get(actor: User, patientReference: string): Promise<DependantResponseDto> {
    const patient = await this.access.resolveAccessiblePatient(actor.id, patientReference);
    const relationship = await this.relationships.findOne({ where: { relatedUserId: actor.id, patientId: patient.id, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE } });
    if (!relationship || relationship.endedAt) throw new NotFoundException('Dependant was not found');
    return this.project(patient, relationship);
  }

  private project(patient: Patient, relationship: PatientRelationship): DependantResponseDto {
    return { patientReference: patient.patientReference, firstName: patient.givenName, lastName: patient.familyName,
      displayName: `${patient.givenName} ${patient.familyName}`.trim(), dateOfBirth: patient.dateOfBirth!,
      countryCode: patient.countryCode!, stateOrRegion: patient.stateOrRegion!, city: patient.city!,
      relationship: { type: relationship.relationshipType, role: relationship.role, isPrimary: relationship.isPrimary } };
  }
}
