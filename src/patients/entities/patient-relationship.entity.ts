import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PatientRelationshipRole, PatientRelationshipStatus, PatientRelationshipType } from '../enums/patient-relationship.enum';
import { Patient } from './patient.entity';

@Entity('patient_relationships')
@Index('UQ_patient_relationships_active_guardian', ['relatedUserId', 'patientId', 'role'], { unique: true, where: `"status" = 'ACTIVE'` })
@Index('IDX_patient_relationships_patient_status', ['patientId', 'status'])
@Index('IDX_patient_relationships_user_status', ['relatedUserId', 'status'])
@Check('CHK_patient_relationships_lifecycle', `("status" = 'ACTIVE' AND "ended_at" IS NULL) OR "status" = 'INACTIVE'`)
export class PatientRelationship {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'related_user_id', type: 'uuid' }) relatedUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'related_user_id' }) relatedUser!: User;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'relationship_type', type: 'enum', enum: PatientRelationshipType, enumName: 'patient_relationship_type_enum' }) relationshipType!: PatientRelationshipType;
  @Column({ type: 'enum', enum: PatientRelationshipRole, enumName: 'patient_relationship_role_enum' }) role!: PatientRelationshipRole;
  @Column({ type: 'enum', enum: PatientRelationshipStatus, enumName: 'patient_relationship_status_enum', default: PatientRelationshipStatus.ACTIVE }) status!: PatientRelationshipStatus;
  @Column({ name: 'is_primary', type: 'boolean', default: false }) isPrimary!: boolean;
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true }) endedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
