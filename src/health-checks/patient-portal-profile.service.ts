import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { PatientPortalProfileDto } from './dto/patient-portal-profile.dto';

@Injectable()
export class PatientPortalProfileService {
  constructor(@InjectRepository(Patient) private readonly patients: Repository<Patient>) {}
  async get(user: User): Promise<PatientPortalProfileDto> {
    const patient = await this.patients.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found for the authenticated user');
    return { user: { displayName: user.displayName!, email: user.email! }, patient: { patientReference: patient.patientReference, givenName: patient.givenName, familyName: patient.familyName, phone: patient.phone } };
  }
}
