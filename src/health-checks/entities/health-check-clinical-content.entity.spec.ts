import { getMetadataArgsStorage } from 'typeorm';

import { HealthCheckClinicalContent } from './health-check-clinical-content.entity';
import { HealthCheckPackageAddon } from './health-check-package-addon.entity';
import { HealthCheckPackageContent } from './health-check-package-content.entity';
import { ProviderServiceAddon } from '../../providers/entities/provider-service-addon.entity';

describe('HealthCheckClinicalContent entity', () => {
  const metadata = getMetadataArgsStorage();

  it('owns the unique canonical code and constrained result contract', () => {
    expect(metadata.indices.find((index) => index.target === HealthCheckClinicalContent && index.name === 'UQ_health_check_clinical_contents_code')).toMatchObject({ unique: true });
    expect(metadata.columns.find((column) => column.target === HealthCheckClinicalContent && column.propertyName === 'resultType')?.options).toMatchObject({ enumName: 'health_check_clinical_result_type_enum' });
    expect(metadata.checks.find((check) => check.target === HealthCheckClinicalContent && check.name === 'CHK_health_check_clinical_contents_result_contract')).toBeDefined();
  });

  it('is the single definition referenced by composition and both add-on eligibility layers', () => {
    for (const entity of [HealthCheckPackageContent, HealthCheckPackageAddon, ProviderServiceAddon]) {
      expect(metadata.relations.find((relation) => relation.target === entity && relation.propertyName === 'clinicalContent')?.options).toMatchObject({ onDelete: 'RESTRICT' });
    }
  });
});
