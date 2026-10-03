import { PartnerFacilityType } from '../../patient-provider-connections/entities/partner-facility-listing.entity';

/**
 * Nigeria's national Health Facility Registry (NHFR), run by the Federal Ministry of Health.
 * Read-only REST API with an X-API-Key, 60 requests a minute, up to 100 results a page.
 * Docs: https://hfr.fmohconnect.gov.ng/developers
 *
 * The list responses look like { data: { facilities: [...] }, meta: { current_page, last_page } }.
 * Pharmacies, labs and imaging use the same envelope with their own list key, so the parser is
 * deliberately forgiving about field names and nesting.
 */
export interface RegistryFacility {
  /** Stable reference within the registry, e.g. "hosp-123". */
  ref: string;
  uniqueId: string | null;
  name: string;
  facilityType: PartnerFacilityType;
  state: string | null;
  lga: string | null;
  ward: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  level: string | null;
  ownership: string | null;
  operationalStatus: string | null;
  registrationStatus: string | null;
  licenceStatus: string | null;
  accreditationStatus: string | null;
  phone: string | null;
  email: string | null;
}

export interface RegistryPage {
  items: RegistryFacility[];
  page: number;
  lastPage: number;
  total: number | null;
}

export interface FacilityRegistryClient {
  readonly configured: boolean;
  list(kind: RegistryKind, page: number, perPage: number): Promise<RegistryPage>;
}

export type RegistryKind = 'facilities' | 'pharmacies' | 'laboratories' | 'imaging';
export const REGISTRY_KINDS: readonly RegistryKind[] = ['facilities', 'pharmacies', 'laboratories', 'imaging'];
const KIND_TYPE: Record<RegistryKind, PartnerFacilityType> = {
  facilities: PartnerFacilityType.HOSPITAL,
  pharmacies: PartnerFacilityType.PHARMACY,
  laboratories: PartnerFacilityType.LABORATORY,
  imaging: PartnerFacilityType.RADIOLOGY,
};
const KIND_PREFIX: Record<RegistryKind, string> = { facilities: 'hosp', pharmacies: 'pharm', laboratories: 'lab', imaging: 'img' };

export class RegistryError extends Error {
  constructor(readonly code: string, readonly retryAfterMs: number | null = null) {
    super(`Registry request failed: ${code}`);
    this.name = 'RegistryError';
  }
}

export class HfrClient implements FacilityRegistryClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly baseUrl = 'https://backend.hfr.fmohconnect.gov.ng',
    private readonly timeoutMs = 60_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async list(kind: RegistryKind, page: number, perPage: number): Promise<RegistryPage> {
    if (!this.apiKey) throw new RegistryError('NOT_CONFIGURED');
    const url = `${this.baseUrl.replace(/\/+$/, '')}/api/v1/${kind}?page=${page}&per_page=${perPage}&sort_by=updated_at&sort_order=asc`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { 'X-API-Key': this.apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new RegistryError('NETWORK');
    }
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      throw new RegistryError('RATE_LIMITED', Number.isFinite(after) && after > 0 ? after * 1000 : 60_000);
    }
    if (res.status === 401 || res.status === 403) throw new RegistryError('KEY_REJECTED');
    if (!res.ok) throw new RegistryError(`HTTP_${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new RegistryError('BAD_JSON');
    }
    return parsePage(kind, body, page);
  }
}

// ---------- Parsing ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** First non-empty value among dotted paths, e.g. "location.state.name". */
function pick(o: Obj, ...paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = o;
    for (const part of path.split('.')) cur = isObj(cur) ? cur[part] : undefined;
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return null;
}

/** A name from either "Lagos" or { id, name: "Lagos" }. */
function label(v: unknown): string | null {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim() || null;
  if (typeof v === 'number') return String(v);
  if (isObj(v)) return label(v['name'] ?? v['title'] ?? v['label'] ?? v['value']);
  return null;
}

function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max && n !== 0 ? n : null;
}

function cleanEmail(v: unknown): string | null {
  const e = label(v)?.toLowerCase() ?? '';
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e) ? e.slice(0, 254) : null;
}

function cleanPhone(v: unknown): string | null {
  // Some rows hold two numbers ("0803..., 0805..."): keep the first.
  const first = (label(v) ?? '').split(/[,;/]| or /i)[0]?.trim() ?? '';
  return first && /\d{7,}/.test(first.replace(/\D/g, '')) ? first.slice(0, 40) : null;
}

export function parseFacility(kind: RegistryKind, raw: unknown): RegistryFacility | null {
  if (!isObj(raw)) return null;
  const id = pick(raw, 'id', 'facility_id', 'premises_id');
  const name = label(pick(raw, 'facility_name', 'name', 'premises_name', 'business_name', 'laboratory_name'));
  if (id === null || !name) return null;
  const idText = String(id).trim();
  const prefix = KIND_PREFIX[kind];
  return {
    ref: idText.startsWith(`${prefix}-`) ? idText : `${prefix}-${idText}`,
    uniqueId: label(pick(raw, 'unique_id', 'facility_code', 'registration_number', 'premises_number', 'licence_number', 'license_number')),
    name: name.slice(0, 240),
    facilityType: KIND_TYPE[kind],
    state: label(pick(raw, 'location.state', 'state', 'state_name')),
    lga: label(pick(raw, 'location.lga', 'lga', 'lga_name')),
    ward: label(pick(raw, 'location.ward', 'ward', 'ward_name')),
    address: label(pick(raw, 'location.address', 'address', 'contact.address', 'street_address'))?.slice(0, 300) ?? null,
    latitude: num(pick(raw, 'location.latitude', 'latitude', 'lat', 'location.coordinates.latitude'), -90, 90),
    longitude: num(pick(raw, 'location.longitude', 'longitude', 'lng', 'lon', 'location.coordinates.longitude'), -180, 180),
    level: label(pick(raw, 'classification.facility_level', 'facility_level', 'level_of_care', 'level')),
    ownership: label(pick(raw, 'classification.ownership', 'ownership', 'ownership_type')),
    operationalStatus: label(pick(raw, 'status.operational', 'operational_status', 'operation_status')),
    registrationStatus: label(pick(raw, 'status.registration', 'registration_status')),
    licenceStatus: label(pick(raw, 'status.license', 'status.licence', 'license_status', 'licence_status')),
    accreditationStatus: label(pick(raw, 'status.accreditation', 'accreditation_status')),
    phone: cleanPhone(pick(raw, 'contact.phone_number', 'contact.phone', 'phone_number', 'phone', 'telephone', 'mobile')),
    email: cleanEmail(pick(raw, 'contact.email', 'email', 'email_address')),
  };
}

export function parsePage(kind: RegistryKind, body: unknown, requestedPage: number): RegistryPage {
  if (!isObj(body)) throw new RegistryError('BAD_SHAPE');
  const data = body['data'];
  let list: unknown[] | null = null;
  if (Array.isArray(data)) list = data;
  else if (isObj(data)) {
    const arrays = Object.values(data).filter(Array.isArray) as unknown[][];
    list = (data[kind] as unknown[]) ?? arrays[0] ?? null;
  }
  if (!Array.isArray(list)) throw new RegistryError('BAD_SHAPE');
  const meta = isObj(body['meta']) ? body['meta'] : isObj(data) && isObj((data as Obj)['meta']) ? ((data as Obj)['meta'] as Obj) : {};
  const page = Number(meta['current_page'] ?? requestedPage) || requestedPage;
  const lastPage = Number(meta['last_page'] ?? meta['total_pages'] ?? (list.length ? page + 1 : page)) || page;
  const total = meta['total'] === undefined ? null : Number(meta['total']);
  return { items: list.map((r) => parseFacility(kind, r)).filter((f): f is RegistryFacility => f !== null), page, lastPage, total: Number.isFinite(total) ? total : null };
}

// ---------- What the statuses mean ----------

const BAD = /not|non|closed|suspend|revok|expir|inactive|withdraw|pending|unregistered|unlicen|reject|denied|invalid/i;

/** Open for patients. Unknown counts as open; only an explicit "closed"-type status hides it. */
export function isOperational(f: Pick<RegistryFacility, 'operationalStatus'>): boolean {
  return !f.operationalStatus || !BAD.test(f.operationalStatus);
}

/**
 * Good standing in the registry: operating, and registered or licensed (or accredited, for labs),
 * with nothing in its statuses saying expired, suspended or pending. This is what lets a facility
 * claimed through the registry contact go live without staff checking its licence.
 */
export function isRegistryVerified(f: Pick<RegistryFacility, 'operationalStatus' | 'registrationStatus' | 'licenceStatus' | 'accreditationStatus'>): boolean {
  if (!isOperational(f)) return false;
  const statuses = [f.registrationStatus, f.licenceStatus, f.accreditationStatus].filter((s): s is string => Boolean(s));
  if (!statuses.length) return false;
  if (statuses.some((s) => BAD.test(s))) return false;
  return statuses.some((s) => /regist|licen[cs]|accredit|approv|valid|active|current/i.test(s));
}
