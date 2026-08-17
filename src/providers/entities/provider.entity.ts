import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { ProviderStatus } from '../enums/provider-status.enum';
import { ProviderAssignment } from './provider-assignment.entity';
import { ProviderLocation } from './provider-location.entity';
import { ProviderService } from './provider-service.entity';

@Entity('providers')
@Index('UQ_providers_user_id', ['userId'], { unique: true, where: '"user_id" IS NOT NULL' })
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @OneToOne(() => User, (user) => user.provider, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'display_name', type: 'varchar' })
  displayName!: string;

  @Column({ name: 'professional_reference', type: 'varchar', nullable: true })
  professionalReference!: string | null;

  @Column({ type: 'enum', enum: ProviderStatus, enumName: 'provider_status_enum', default: ProviderStatus.PENDING })
  status!: ProviderStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => ProviderAssignment, (assignment) => assignment.provider)
  assignments!: ProviderAssignment[];

  @OneToMany(() => ProviderService, (service) => service.provider)
  services!: ProviderService[];

  @OneToMany(() => ProviderLocation, (location) => location.provider)
  locations!: ProviderLocation[];
}
