import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveHealthCheckMeasurementsDto } from './save-health-check-measurements.dto';

describe('SaveHealthCheckMeasurementsDto', () => {
  const valid = { bloodPressure: { systolic: 120, diastolic: 80 }, bloodGlucose: { value: 95 }, bmi: { value: 24.2 }, temperature: { value: 36.8 }, oxygenSaturation: { value: 98 }, pulse: { value: 72 } };
  it('accepts the six structurally complete measurements', async () => expect(await validate(plainToInstance(SaveHealthCheckMeasurementsDto, valid))).toHaveLength(0));
  it('rejects incomplete blood pressure and missing measurements', async () => { const value: any = structuredClone(valid); delete value.bloodPressure.diastolic; delete value.pulse; expect((await validate(plainToInstance(SaveHealthCheckMeasurementsDto, value))).length).toBeGreaterThan(0); });
  it('rejects non-numeric and over-precision values without clinical range interpretation', async () => { const value: any = structuredClone(valid); value.temperature.value = 'not-a-number'; value.bmi.value = 1.12345; expect((await validate(plainToInstance(SaveHealthCheckMeasurementsDto, value))).length).toBeGreaterThan(0); });
});
