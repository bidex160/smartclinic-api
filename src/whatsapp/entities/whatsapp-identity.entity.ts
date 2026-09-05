import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { WhatsAppIdentityStatus, WhatsAppProviderCode } from '../whatsapp.types';

@Entity('whatsapp_identities')
@Index('UQ_whatsapp_identities_provider_phone', ['provider', 'phoneNormalized'], { unique: true })
@Index('UQ_whatsapp_identities_provider_user', ['provider', 'providerUserId'], { unique: true, where: '"provider_user_id" IS NOT NULL' })
@Index('IDX_whatsapp_identities_user', ['userId'])
@Index('IDX_whatsapp_identities_patient', ['patientId'])
@Check('CHK_whatsapp_identities_linkage', `("status" = 'LINKED' AND "user_id" IS NOT NULL AND "patient_id" IS NOT NULL AND "linked_at" IS NOT NULL) OR "status" <> 'LINKED'`)
export class WhatsAppIdentity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'enum', enum: WhatsAppProviderCode, enumName: 'whatsapp_provider_enum' }) provider!: WhatsAppProviderCode;
  @Column({ name: 'provider_user_id', type: 'varchar', length: 64, nullable: true }) providerUserId!: string | null;
  @Column({ name: 'phone_normalized', type: 'varchar', length: 32 }) phoneNormalized!: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User | null;
  @Column({ name: 'patient_id', type: 'uuid', nullable: true }) patientId!: string | null;
  @ManyToOne(() => Patient, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient | null;
  @Column({ type: 'enum', enum: WhatsAppIdentityStatus, enumName: 'whatsapp_identity_status_enum', default: WhatsAppIdentityStatus.UNLINKED }) status!: WhatsAppIdentityStatus;
  @Column({ name: 'first_seen_at', type: 'timestamptz' }) firstSeenAt!: Date;
  @Column({ name: 'last_seen_at', type: 'timestamptz' }) lastSeenAt!: Date;
  @Column({ name: 'linked_at', type: 'timestamptz', nullable: true }) linkedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
