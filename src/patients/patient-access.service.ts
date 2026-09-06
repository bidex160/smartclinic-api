import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { AccessiblePatientResponseDto } from './dto/dependant.dto';
import { Patient } from './entities/patient.entity';
import { PatientRelationship } from './entities/patient-relationship.entity';
import { PatientRelationshipRole, PatientRelationshipStatus } from './enums/patient-relationship.enum';
import { PatientStatus } from './enums/patient-status.enum';

@Injectable()
export class PatientAccessService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientRelationship) private readonly relationships: Repository<PatientRelationship>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async resolveAccessiblePatient(actorUserId: string, patientReference: string): Promise<Patient> {
    await this.requireEligibleActor(actorUserId);
    const patient = await this.patients.findOne({ where: { patientReference, status: PatientStatus.ACTIVE }, withDeleted: true });
    if (!patient || patient.deletedAt) throw new NotFoundException('Patient was not found');
    if (patient.userId === actorUserId) return patient;
    const relationship = await this.relationships.findOne({ where: { relatedUserId: actorUserId, patientId: patient.id, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE } });
    if (!relationship || relationship.endedAt) throw new NotFoundException('Patient was not found');
    return patient;
  }

  async canAccessPatient(actorUserId: string, patientId: string): Promise<boolean> {
    try {
      await this.requireEligibleActor(actorUserId);
      const patient = await this.patients.findOne({ where: { id: patientId, status: PatientStatus.ACTIVE }, withDeleted: true });
      if (!patient || patient.deletedAt) return false;
      if (patient.userId === actorUserId) return true;
      const relationship = await this.relationships.findOne({ where: { relatedUserId: actorUserId, patientId, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE } });
      return !!relationship && !relationship.endedAt;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  async listAccessiblePatients(actorUserId: string): Promise<AccessiblePatientResponseDto[]> {
    await this.requireEligibleActor(actorUserId);
    const [self, relationships] = await Promise.all([
      this.patients.findOne({ where: { userId: actorUserId, status: PatientStatus.ACTIVE }, withDeleted: true }),
      this.relationships.find({ where: { relatedUserId: actorUserId, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE }, relations: { patient: true }, order: { createdAt: 'ASC' } }),
    ]);
    const items: AccessiblePatientResponseDto[] = [];
    if (self && !self.deletedAt) items.push(this.project(self, 'SELF', null));
    for (const relationship of relationships) if (!relationship.endedAt && relationship.patient && !relationship.patient.deletedAt && relationship.patient.status === PatientStatus.ACTIVE) {
      items.push(this.project(relationship.patient, 'DEPENDANT', relationship));
    }
    return items;
  }

  private async requireEligibleActor(actorUserId: string): Promise<User> {
    const actor = await this.users.findOne({ where: { id: actorUserId, status: UserStatus.ACTIVE }, withDeleted: true });
    if (!actor || actor.deletedAt || !actor.roles.includes(UserRole.USER)) throw new NotFoundException('Patient was not found');
    return actor;
  }

  private project(patient: Patient, accessKind: 'SELF' | 'DEPENDANT', relationship: PatientRelationship | null): AccessiblePatientResponseDto {
    return {
      patientReference: patient.patientReference, firstName: patient.givenName, lastName: patient.familyName,
      displayName: `${patient.givenName} ${patient.familyName}`.trim(), dateOfBirth: patient.dateOfBirth,
      countryCode: patient.countryCode, stateOrRegion: patient.stateOrRegion, city: patient.city, accessKind,
      relationship: relationship ? { type: relationship.relationshipType, role: relationship.role, isPrimary: relationship.isPrimary } : null,
    };
  }
}
