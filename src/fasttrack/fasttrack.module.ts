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

@Module({ imports: [AuthModule, ProvidersModule, PaymentsModule, TypeOrmModule.forFeature([FastTrackRequest, FastTrackRequestStatusHistory, Patient])], controllers: [MeFastTrackController, ProviderFastTrackController, AdminFastTrackController], providers: [FastTrackService], exports: [FastTrackService] })
export class FastTrackModule {}
