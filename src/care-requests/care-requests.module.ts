import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Patient } from '../patients/entities/patient.entity';
import { ProvidersModule } from '../providers/providers.module';
import { CareRequest } from './entities/care-request.entity';
import { CareRequestStatusHistory } from './entities/care-request-status-history.entity';
import { AdminCareRequestsController, MeCareRequestsController, ProviderCareRequestsController } from './care-requests.controller';
import { CareRequestsService } from './care-requests.service';
import { User } from '../users/entities/user.entity';
import { CareRequestFunding } from './entities/care-request-funding.entity';

@Module({
  imports: [AuthModule, ProvidersModule, TypeOrmModule.forFeature([CareRequest, CareRequestFunding, CareRequestStatusHistory, Patient, User])],
  controllers: [MeCareRequestsController, ProviderCareRequestsController, AdminCareRequestsController],
  providers: [CareRequestsService],
  exports: [CareRequestsService],
})
export class CareRequestsModule {}
