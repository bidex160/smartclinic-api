export enum HealthCheckMeasurementCode {
  BLOOD_PRESSURE = 'BLOOD_PRESSURE',
  BLOOD_GLUCOSE = 'BLOOD_GLUCOSE',
  BMI = 'BMI',
  TEMPERATURE = 'TEMPERATURE',
  OXYGEN_SATURATION = 'OXYGEN_SATURATION',
  PULSE = 'PULSE',
}

export const HEALTH_CHECK_MEASUREMENT_UNITS: Record<HealthCheckMeasurementCode, string> = {
  [HealthCheckMeasurementCode.BLOOD_PRESSURE]: 'mmHg',
  [HealthCheckMeasurementCode.BLOOD_GLUCOSE]: 'mg/dL',
  [HealthCheckMeasurementCode.BMI]: 'kg/m²',
  [HealthCheckMeasurementCode.TEMPERATURE]: '°C',
  [HealthCheckMeasurementCode.OXYGEN_SATURATION]: '%',
  [HealthCheckMeasurementCode.PULSE]: 'bpm',
};
