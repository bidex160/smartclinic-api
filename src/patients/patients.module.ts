import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Patient } from './entities/patient.entity';

@Module({ imports: [TypeOrmModule.forFeature([Patient])] })
export class PatientsModule {}
