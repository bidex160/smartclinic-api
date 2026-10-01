/** Where a Clinical Order came from. */
export enum ClinicalOrderOrigin {
  /** Issued during a SmartClinic care appointment. */
  APPOINTMENT = 'APPOINTMENT',
  /** Sent by a provider using the patient's SmartClinic ID, from any setting or records system. */
  DIRECT = 'DIRECT',
}

/** The patient's answer to a directly sent request. Appointment orders have none. */
export enum ClinicalOrderPatientResponse {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
}
