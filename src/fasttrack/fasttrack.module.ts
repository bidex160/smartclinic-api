import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Patient } from '../patients/entities/patient.entity';
import { PaymentsModule } from '../payments/payments.module';
import { ProvidersModule } from '../providers/providers.module';
import { FastTrackRequestStatusHistory } from './entities/fasttrack-request-status-history.entity';
import { FastTrackRequest } from './entities/fasttrack-request.entity';
import { AdminFastTrackController, MeFastTrackController, ProviderFastTrackController } from './fasttrack.controller';
import { FastTrackService } from './fasttrack.service';
import { User } from '../users/entities/user.entity';

@Module({ imports: [AuthModule, ProvidersModule, PaymentsModule, TypeOrmModule.forFeature([FastTrackRequest, FastTrackRequestStatusHistory, Patient, User])], controllers: [MeFastTrackController, ProviderFastTrackController, AdminFastTrackController], providers: [FastTrackService], exports: [FastTrackService] })
export class FastTrackModule {}
