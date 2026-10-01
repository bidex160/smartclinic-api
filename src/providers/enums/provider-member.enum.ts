/** What a staff member does at a facility; it shapes their home screen and what they can do. */
export enum ProviderMemberRole {
  /** Manages the facility's team and setup. */
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  LAB_SCIENTIST = 'LAB_SCIENTIST',
  PHARMACIST = 'PHARMACIST',
  FRONT_DESK = 'FRONT_DESK',
}

export enum ProviderMemberStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  REMOVED = 'REMOVED',
}

/** Roles that can send prescriptions and test requests. The facility owner always can. */
export const PRESCRIBING_ROLES: ReadonlySet<ProviderMemberRole> = new Set([ProviderMemberRole.DOCTOR]);
/** Roles that can manage the team and facility setup. The facility owner always can. */
export const MANAGING_ROLES: ReadonlySet<ProviderMemberRole> = new Set([ProviderMemberRole.ADMIN]);
