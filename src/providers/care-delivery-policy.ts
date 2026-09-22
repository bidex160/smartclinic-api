import { BadRequestException } from '@nestjs/common';
import { ClinicalRecordType } from '../clinical-records/enums/clinical-record-type.enum';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';

type Service = { code: string; clinicalRecordType?: ClinicalRecordType | null };
export function supportsCareDelivery(definition: Service, mode: CareDeliveryMode): boolean {
  const physicalTest = ['LAB_REQUEST', 'IMAGING_REQUEST'].includes(definition.code) ||
    definition.clinicalRecordType === ClinicalRecordType.LAB_RESULT ||
    definition.clinicalRecordType === ClinicalRecordType.IMAGING_RESULT;
  return !(physicalTest && mode === CareDeliveryMode.VIRTUAL);
}
export function assertCareDelivery(definition: Service, mode: CareDeliveryMode): void {
  if (!supportsCareDelivery(definition, mode)) {
    throw new BadRequestException('Laboratory tests and imaging require in-person care or a home visit');
  }
}
