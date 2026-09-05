import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { PatientPortalProfileDto } from './dto/patient-portal-profile.dto';
import { UpdatePatientPortalProfileDto } from './dto/update-patient-portal-profile.dto';
import { normalizePhoneNumber } from '../users/phone-normalization';

@Injectable()
export class PatientPortalProfileService {
  constructor(@InjectRepository(Patient) private readonly patients: Repository<Patient>) {}
  async get(user: User): Promise<PatientPortalProfileDto> {
    const patient = await this.patients.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found for the authenticated user');
    return this.project(user, patient);
  }

  async update(user: User, dto: UpdatePatientPortalProfileDto): Promise<PatientPortalProfileDto> {
    if (dto.dateOfBirth && dto.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('dateOfBirth cannot be in the future');
    }
    return this.patients.manager.transaction(async (manager) => {
      const patientRepository = manager.getRepository(Patient);
      const patient = await patientRepository.findOne({ where: { userId: user.id }, withDeleted: true });
      if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found for the authenticated user');
      if (dto.givenName !== undefined) patient.givenName = dto.givenName;
      if (dto.familyName !== undefined) patient.familyName = dto.familyName;
      const normalizedPhone = dto.phone ? normalizePhoneNumber(dto.phone) : null;
      if (dto.phone && !normalizedPhone) throw new BadRequestException('phone must be a valid phone number');
      if (dto.phone !== undefined && !normalizedPhone && !user.emailNormalized && !user.email) {
        throw new BadRequestException('At least one login email or phone number must remain on the account');
      }
      if (normalizedPhone) {
        const owner = await manager.getRepository(User).findOne({ where: { phoneNormalized: normalizedPhone } });
        if (owner && owner.id !== user.id) throw new BadRequestException('phone number is already associated with another account');
      }
      if (dto.phone !== undefined) patient.phone = normalizedPhone;
      if (dto.dateOfBirth !== undefined) patient.dateOfBirth = dto.dateOfBirth;
      const saved = await patientRepository.save(patient);
      const displayName = `${saved.givenName} ${saved.familyName}`.trim();
      const userChanges: { displayName?: string; phoneNormalized?: string | null } = {};
      if (displayName !== user.displayName) userChanges.displayName = displayName;
      if (dto.phone !== undefined) userChanges.phoneNormalized = normalizedPhone;
      if (Object.keys(userChanges).length) await manager.getRepository(User).update(user.id, userChanges);
      return this.project({ ...user, displayName }, saved);
    });
  }

  private project(user: User, patient: Patient): PatientPortalProfileDto {
    return { user: { displayName: user.displayName!, email: user.email }, patient: { patientReference: patient.patientReference, givenName: patient.givenName, familyName: patient.familyName, phone: patient.phone, dateOfBirth: patient.dateOfBirth } };
  }
}
