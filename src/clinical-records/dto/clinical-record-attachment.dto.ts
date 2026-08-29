import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { CLINICAL_ATTACHMENT_REFERENCE_EXAMPLE, CLINICAL_ATTACHMENT_REFERENCE_PATTERN } from '../clinical-attachment-reference';
import { CLINICAL_RECORD_REFERENCE_EXAMPLE, CLINICAL_RECORD_REFERENCE_PATTERN } from '../clinical-record-reference';

export class ClinicalRecordAttachmentParamsDto {
  @ApiProperty({ example: CLINICAL_RECORD_REFERENCE_EXAMPLE }) @Matches(CLINICAL_RECORD_REFERENCE_PATTERN) recordReference!: string;
  @ApiProperty({ example: CLINICAL_ATTACHMENT_REFERENCE_EXAMPLE }) @Matches(CLINICAL_ATTACHMENT_REFERENCE_PATTERN) attachmentReference!: string;
}

export class ClinicalRecordAttachmentUploadParamsDto {
  @ApiProperty({ example: CLINICAL_RECORD_REFERENCE_EXAMPLE }) @Matches(CLINICAL_RECORD_REFERENCE_PATTERN) recordReference!: string;
}
