const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const NIGERIAN_LOCAL_PATTERN = /^0[1-9]\d{9}$/;
const NIGERIAN_INTERNATIONAL_PATTERN = /^234[1-9]\d{9}$/;

export function normalizePhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[^+\d\s()-]/.test(trimmed) || (trimmed.match(/\+/g)?.length ?? 0) > 1)
    return null;
  const compact = trimmed.replace(/[\s()-]/g, '');
  if (NIGERIAN_LOCAL_PATTERN.test(compact)) return `+234${compact.slice(1)}`;
  if (NIGERIAN_INTERNATIONAL_PATTERN.test(compact)) return `+${compact}`;
  return E164_PATTERN.test(compact) ? compact : null;
}

export function requireNormalizedPhoneNumber(value: string): string {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) throw new Error('Invalid phone number');
  return normalized;
}
