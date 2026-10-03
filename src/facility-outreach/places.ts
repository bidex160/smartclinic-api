/**
 * One spelling per state, so "FCT", "Abuja" and "Federal Capital Territory" are the same place on
 * every dashboard. Names match the website's country/state picker.
 */
const NG_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'Federal Capital Territory', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];
const RW_PROVINCES = ['City of Kigali', 'Eastern Province', 'Northern Province', 'Southern Province', 'Western Province'];
const GH_REGIONS = [
  'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah',
  'Upper East', 'Upper West', 'Volta', 'Western', 'Western North',
];

const ALIASES: Record<string, Record<string, string>> = {
  NG: {
    fct: 'Federal Capital Territory', 'f.c.t': 'Federal Capital Territory', 'f.c.t.': 'Federal Capital Territory', abuja: 'Federal Capital Territory',
    'fct abuja': 'Federal Capital Territory', 'abuja fct': 'Federal Capital Territory', 'abuja federal capital territory': 'Federal Capital Territory',
    'federal capital territory abuja': 'Federal Capital Territory', 'akwa-ibom': 'Akwa Ibom', nassarawa: 'Nasarawa', 'cross-river': 'Cross River',
  },
  RW: { kigali: 'City of Kigali', 'kigali city': 'City of Kigali', 'city of kigali': 'City of Kigali', east: 'Eastern Province', eastern: 'Eastern Province', north: 'Northern Province', northern: 'Northern Province', south: 'Southern Province', southern: 'Southern Province', west: 'Western Province', western: 'Western Province' },
  GH: { accra: 'Greater Accra', 'greater accra region': 'Greater Accra' },
};
const KNOWN: Record<string, string[]> = { NG: NG_STATES, RW: RW_PROVINCES, GH: GH_REGIONS };

/** "lagos state" → "Lagos", "FCT" → "Federal Capital Territory". Unknown names are tidied, not dropped. */
export function normalizeState(countryCode: string | null | undefined, raw: string | null | undefined): string | null {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  const country = String(countryCode ?? '').toUpperCase();
  const key = value.toLowerCase().replace(/\s+(state|region)$/i, '').trim();
  const alias = ALIASES[country]?.[key] ?? ALIASES[country]?.[value.toLowerCase()];
  if (alias) return alias;
  const known = KNOWN[country]?.find((s) => s.toLowerCase() === key || s.toLowerCase() === value.toLowerCase());
  if (known) return known;
  return value.replace(/\s+state$/i, '').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Keep digits and a leading +. "0803 123 4567" stays local; staff fix the format if needed. */
export function normalizePhone(countryCode: string, raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  let digits = v.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  const cc: Record<string, string> = { NG: '234', GH: '233', RW: '250' };
  if (!digits.startsWith('+') && digits.startsWith('0') && cc[countryCode]) digits = `+${cc[countryCode]}${digits.slice(1)}`;
  if (!digits.startsWith('+') && cc[countryCode] && digits.startsWith(cc[countryCode])) digits = `+${digits}`;
  return /^\+?\d{7,15}$/.test(digits) ? digits : null;
}
