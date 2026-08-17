import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Organisation } from './entities/organisation.entity';

@Module({ imports: [TypeOrmModule.forFeature([Organisation])] })
export class OrganisationsModule {}
