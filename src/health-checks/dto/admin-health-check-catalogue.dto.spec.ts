import { ValidationPipe } from '@nestjs/common';
import { HealthCheckClinicalResultType } from '../enums/health-check-clinical-result-type.enum';
import { CreateAdminClinicalContentDto, UpdateAdminClinicalContentDto, UpdateAdminHealthCheckPackageDto } from './admin-health-check-catalogue.dto';

describe('Admin Health Check catalogue DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

  it('normalizes a constrained new non-result content code', async () => {
    await expect(pipe.transform({ code: ' clinician_follow_up ', name: 'Follow-up', category: 'SERVICE', resultType: HealthCheckClinicalResultType.NONE }, { type: 'body', metatype: CreateAdminClinicalContentDto })).resolves.toMatchObject({ code: 'CLINICIAN_FOLLOW_UP', resultType: 'NONE' });
  });

  it('rejects arbitrary codes and unknown result contracts', async () => {
    await expect(pipe.transform({ code: 'bad code', name: 'Bad', category: 'SERVICE', resultType: 'CUSTOM' }, { type: 'body', metatype: CreateAdminClinicalContentDto })).rejects.toBeDefined();
  });

  it.each([
    [UpdateAdminClinicalContentDto, { code: 'RENAMED' }],
    [UpdateAdminClinicalContentDto, { resultType: HealthCheckClinicalResultType.SINGLE_NUMERIC }],
    [UpdateAdminClinicalContentDto, { unit: 'mg/dL' }],
    [UpdateAdminHealthCheckPackageDto, { code: 'RENAMED' }],
    [UpdateAdminHealthCheckPackageDto, { isActive: false }],
  ])('rejects immutable or lifecycle fields outside dedicated contracts', async (metatype, value) => {
    await expect(pipe.transform(value, { type: 'body', metatype: metatype as any })).rejects.toBeDefined();
  });
});
