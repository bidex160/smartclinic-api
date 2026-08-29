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
import { ClinicalRecordAttachmentsService } from './clinical-record-attachments.service';
import { MeClinicalRecordAttachmentsController, ProviderClinicalRecordAttachmentsController } from './clinical-record-attachments.controller';
import { CLINICAL_ATTACHMENT_STORAGE } from './storage/clinical-attachment-storage';
import { CloudinaryClinicalAttachmentStorage } from './storage/cloudinary-clinical-attachment.storage';

@Module({
  imports: [AuthModule, ProvidersModule, TypeOrmModule.forFeature([ClinicalRecord, ClinicalRecordAttachment, ClinicalConsultationDetail, CareAppointment, CareRequest, Patient, Provider, CareServiceDefinition, User])],
  controllers: [ProviderClinicalRecordsController, MeClinicalRecordsController, ProviderClinicalRecordAttachmentsController, MeClinicalRecordAttachmentsController],
  providers: [ClinicalRecordsService, ClinicalRecordAttachmentsService, CloudinaryClinicalAttachmentStorage, { provide: CLINICAL_ATTACHMENT_STORAGE, useExisting: CloudinaryClinicalAttachmentStorage }],
  exports: [ClinicalRecordsService],
})
export class ClinicalRecordsModule {}
