import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PatientPortalUserDto { @ApiProperty() displayName!: string; @ApiProperty() email!: string; }
class PatientPortalPatientDto { @ApiProperty() patientReference!: string; @ApiProperty() givenName!: string; @ApiProperty() familyName!: string; @ApiPropertyOptional({ nullable: true }) phone!: string | null; @ApiPropertyOptional({ nullable: true, format: 'date' }) dateOfBirth!: string | null; }
export class PatientPortalProfileDto { @ApiProperty({ type: PatientPortalUserDto }) user!: PatientPortalUserDto; @ApiProperty({ type: PatientPortalPatientDto }) patient!: PatientPortalPatientDto; }
