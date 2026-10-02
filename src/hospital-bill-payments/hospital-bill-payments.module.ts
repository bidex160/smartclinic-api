import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { User } from '../users/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientProviderConnection } from '../patient-provider-connections/entities/patient-provider-connection.entity';
import { appConfig } from '../config/app.config';
import { HospitalBillPayment } from './entities/hospital-bill-payment.entity';
import { HospitalBillPaymentItem } from './entities/hospital-bill-payment-item.entity';
import { HospitalBillPaymentsController } from './hospital-bill-payments.controller';
import { HospitalBillPaymentsService } from './hospital-bill-payments.service';
import { HospitalIntegrationService } from './hospital-integration.service';
import { HOSPITAL_EMR_ADAPTER } from './hospital-emr.adapter';
import { AkthHospitalEmrAdapter } from './adapters/akth-hospital-emr.adapter';

@Module({ imports: [ConfigModule.forFeature(appConfig), AuthModule, PaymentsModule, TypeOrmModule.forFeature([HospitalBillPayment, HospitalBillPaymentItem, User, Patient, PatientProviderConnection])], controllers: [HospitalBillPaymentsController], providers: [HospitalBillPaymentsService, AkthHospitalEmrAdapter, HospitalIntegrationService, { provide: HOSPITAL_EMR_ADAPTER, useExisting: AkthHospitalEmrAdapter }], exports: [HospitalBillPaymentsService, HospitalIntegrationService] })
export class HospitalBillPaymentsModule {}
