import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { Patient } from '../patients/entities/patient.entity';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { Provider } from '../providers/entities/provider.entity';
import { ProvidersModule } from '../providers/providers.module';
import { User } from '../users/entities/user.entity';
import { ClinicalRecordsService } from './clinical-records.service';
import { MeClinicalRecordsController, ProviderClinicalRecordsController } from './clinical-records.controller';
import { ClinicalConsultationDetail } from './entities/clinical-consultation-detail.entity';
import { ClinicalRecord } from './entities/clinical-record.entity';
import { ClinicalRecordAttachment } from './entities/clinical-record-attachment.entity';
import { PrivateAttachmentStorageModule } from '../common/storage/private-attachment-storage.module';
import { ClinicalRecordAccessGrant } from './entities/clinical-record-access-grant.entity';
import { ClinicalRecordAccessAudit } from './entities/clinical-record-access-audit.entity';
import { ClinicalRecordAccessRequest } from './entities/clinical-record-access-request.entity';
import { PatientProviderConnection } from '../patient-provider-connections/entities/patient-provider-connection.entity';
import { HealthPassportModule } from '../health-passport/health-passport.module';
import { ClinicalRecordAccessService } from './clinical-record-access.service';
import { MeClinicalRecordAccessController, ProviderClinicalRecordAccessRequestsController, ProviderSharedClinicalRecordsController, ProviderSharedHealthPassportsController } from './clinical-record-access.controller';
import { ClinicalRecordAttachmentsService } from './clinical-record-attachments.service';
import { MeClinicalRecordAttachmentsController, ProviderClinicalRecordAttachmentsController } from './clinical-record-attachments.controller';

@Module({
  imports: [AuthModule, ProvidersModule, HealthPassportModule, PrivateAttachmentStorageModule, TypeOrmModule.forFeature([ClinicalRecord, ClinicalRecordAttachment, ClinicalRecordAccessGrant, ClinicalRecordAccessAudit, ClinicalRecordAccessRequest, PatientProviderConnection, ClinicalConsultationDetail, CareAppointment, CareRequest, Patient, Provider, CareServiceDefinition, User])],
  controllers: [ProviderClinicalRecordsController, MeClinicalRecordsController, ProviderClinicalRecordAttachmentsController, MeClinicalRecordAttachmentsController, MeClinicalRecordAccessController, ProviderSharedClinicalRecordsController, ProviderClinicalRecordAccessRequestsController, ProviderSharedHealthPassportsController],
  providers: [ClinicalRecordsService, ClinicalRecordAttachmentsService, ClinicalRecordAccessService],
  exports: [ClinicalRecordsService],
})
export class ClinicalRecordsModule {}
