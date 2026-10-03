import { ProviderType } from '../enums/provider-type.enum';

/**
 * Who issues licences, by country. Doctors give their council registration; facilities give their
 * operating licence. Staff check the number with the regulator before approval.
 * Only regulators we are sure of are listed; "OTHER" covers the rest.
 */
export interface Regulator {
  code: string;
  name: string;
  countries: readonly string[];
  types: readonly ProviderType[];
  /** Where staff can check a number, when the regulator publishes one. */
  checkUrl?: string;
  /** Only ever set by the system (registry match), never chosen by the provider. */
  automatic?: boolean;
}

const PERSON = [ProviderType.INDIVIDUAL];
const FACILITY = [ProviderType.CLINIC, ProviderType.HOSPITAL, ProviderType.DIAGNOSTIC_CENTRE];

export const REGULATORS: readonly Regulator[] = [
  // Nigeria
  { code: 'MDCN', name: 'Medical and Dental Council of Nigeria', countries: ['NG'], types: PERSON, checkUrl: 'https://mdcn.gov.ng/page/services/primary-source-verification' },
  { code: 'NMCN', name: 'Nursing and Midwifery Council of Nigeria', countries: ['NG'], types: PERSON },
  { code: 'PCN', name: 'Pharmacy Council of Nigeria', countries: ['NG'], types: [ProviderType.INDIVIDUAL, ProviderType.PHARMACY] },
  { code: 'MLSCN', name: 'Medical Laboratory Science Council of Nigeria', countries: ['NG'], types: [ProviderType.INDIVIDUAL, ProviderType.DIAGNOSTIC_CENTRE] },
  { code: 'RRBN', name: 'Radiographers Registration Board of Nigeria', countries: ['NG'], types: [ProviderType.INDIVIDUAL, ProviderType.DIAGNOSTIC_CENTRE] },
  { code: 'MRTB', name: 'Medical Rehabilitation Therapists Board of Nigeria', countries: ['NG'], types: PERSON },
  { code: 'HEFAMAA', name: 'Lagos State Health Facility Monitoring and Accreditation Agency (HEFAMAA)', countries: ['NG'], types: FACILITY },
  { code: 'NG_STATE_MOH', name: 'State Ministry of Health facility registration', countries: ['NG'], types: [...FACILITY, ProviderType.OTHER] },
  { code: 'FMOH', name: 'Federal Ministry of Health (federal hospitals)', countries: ['NG'], types: [ProviderType.HOSPITAL] },
  // Set automatically when a facility claims its registry listing with a code; not offered as a choice at sign-up.
  { code: 'NHFR', name: 'Nigeria Health Facility Registry (Federal Ministry of Health)', countries: ['NG'], types: [...FACILITY, ProviderType.PHARMACY], checkUrl: 'https://hfr.fmohconnect.gov.ng/facilitieslist', automatic: true },
  // Ghana
  { code: 'GMDC', name: 'Medical and Dental Council, Ghana', countries: ['GH'], types: PERSON },
  { code: 'NMC_GH', name: 'Nursing and Midwifery Council of Ghana', countries: ['GH'], types: PERSON },
  { code: 'PC_GH', name: 'Pharmacy Council, Ghana', countries: ['GH'], types: [ProviderType.INDIVIDUAL, ProviderType.PHARMACY] },
  { code: 'AHPC_GH', name: 'Allied Health Professions Council, Ghana', countries: ['GH'], types: [ProviderType.INDIVIDUAL, ProviderType.DIAGNOSTIC_CENTRE] },
  { code: 'HEFRA', name: 'Health Facilities Regulatory Agency, Ghana (HeFRA)', countries: ['GH'], types: FACILITY },
  // Rwanda
  { code: 'RMDC', name: 'Rwanda Medical and Dental Council', countries: ['RW'], types: PERSON },
  { code: 'NCNM', name: 'National Council of Nurses and Midwives, Rwanda', countries: ['RW'], types: PERSON },
  { code: 'NPC_RW', name: 'National Pharmacy Council, Rwanda', countries: ['RW'], types: PERSON },
  { code: 'RAHPC', name: 'Rwanda Allied Health Professions Council', countries: ['RW'], types: [ProviderType.INDIVIDUAL, ProviderType.DIAGNOSTIC_CENTRE] },
  { code: 'RFDA', name: 'Rwanda Food and Drugs Authority (pharmacy licence)', countries: ['RW'], types: [ProviderType.PHARMACY] },
  { code: 'MOH_RW', name: 'Ministry of Health, Rwanda (facility licence)', countries: ['RW'], types: FACILITY },
  // Anything else
  { code: 'OTHER', name: 'Another regulator', countries: [], types: [] },
];

export function regulatorsFor(countryCode: string | null | undefined, type: ProviderType | null | undefined): Regulator[] {
  const country = String(countryCode ?? '').toUpperCase();
  const list = REGULATORS.filter((r) => r.code !== 'OTHER' && !r.automatic && (!country || r.countries.includes(country)) && (!type || r.types.includes(type)));
  return [...list, REGULATORS.find((r) => r.code === 'OTHER')!];
}

export function isRegulator(code: string): boolean {
  return REGULATORS.some((r) => r.code === code && !r.automatic);
}

/** Doctors must say what they practise; facilities may list departments but don't have to. */
export function specialtyRequired(type: ProviderType | null | undefined): boolean {
  return type === ProviderType.INDIVIDUAL;
}

export const MAX_SPECIALTIES: Record<'person' | 'facility', number> = { person: 3, facility: 40 };

/** "MDCN/12345 " → "MDCN/12345". Letters, digits, slash, dash, dot and spaces only. */
export function normaliseLicence(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return /^[A-Z0-9][A-Z0-9 /.\-]{2,59}$/.test(v) ? v : null;
}
