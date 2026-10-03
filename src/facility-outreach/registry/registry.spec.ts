import { PartnerFacilityType } from '../../patient-provider-connections/entities/partner-facility-listing.entity';
import { AfricasTalkingSmsProvider, smsProviderFromEnv, TermiiSmsProvider } from '../../notifications/sms/sms-provider';
import { maskEmail, maskPhone } from '../facility-claim-code.service';
import { canAutoVerify } from '../facility-outreach.service';
import { GooglePlaceMatcher, mapsLinks } from './google-places';
import { HfrClient, isOperational, isRegistryVerified, parseFacility, parsePage, RegistryError } from './hfr-client';
import { FacilityRegistrySyncService } from './registry-sync.service';

/** The sample response from the registry's developer docs. */
const SAMPLE = {
  status: 'success',
  data: {
    facilities: [
      {
        id: 123,
        unique_id: 'AB/01/H/1/P/0001',
        facility_name: 'General Hospital Maitama',
        location: { state: { id: 25, name: 'FCT' }, lga: { id: 512, name: 'Abuja Municipal' }, latitude: 9.0579, longitude: 7.4951 },
        classification: { facility_level: { id: 2, name: 'Secondary' }, ownership: { id: 1, name: 'Public' } },
        status: { operational: { id: 1, name: 'Operational' }, registration: { id: 1, name: 'Registered' } },
        contact: { phone_number: '+2348031234567', email: 'Info@Hospital.ng' },
      },
      { id: 124, facility_name: '' },
    ],
  },
  meta: { current_page: 1, per_page: 25, total: 42567, last_page: 1703 },
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('national registry: reading responses', () => {
  it('reads the documented facility shape', () => {
    const page = parsePage('facilities', SAMPLE, 1);
    expect(page).toMatchObject({ page: 1, lastPage: 1703, total: 42567 });
    expect(page.items).toHaveLength(1); // the row without a name is skipped
    expect(page.items[0]).toEqual({
      ref: 'hosp-123', uniqueId: 'AB/01/H/1/P/0001', name: 'General Hospital Maitama', facilityType: PartnerFacilityType.HOSPITAL,
      state: 'FCT', lga: 'Abuja Municipal', ward: null, address: null, latitude: 9.0579, longitude: 7.4951, level: 'Secondary', ownership: 'Public',
      operationalStatus: 'Operational', registrationStatus: 'Registered', licenceStatus: null, accreditationStatus: null,
      phone: '+2348031234567', email: 'info@hospital.ng',
    });
  });

  it('copes with flatter shapes for pharmacies and labs', () => {
    const page = parsePage('pharmacies', { data: [{ id: 'pharm-9', premises_name: 'Medplus Ikeja', state: 'Lagos', lga: 'Ikeja', phone: '0803 111 2222, 0805 333 4444', email: 'not-an-email', latitude: '6.6', longitude: 0 }] }, 3);
    expect(page.items[0]).toMatchObject({ ref: 'pharm-9', name: 'Medplus Ikeja', facilityType: PartnerFacilityType.PHARMACY, state: 'Lagos', phone: '0803 111 2222', email: null, latitude: 6.6, longitude: null });
    expect(page.page).toBe(3);
    expect(() => parsePage('laboratories', { data: 'nope' }, 1)).toThrow(RegistryError);
    expect(parseFacility('imaging', { id: 5, name: 'Scan Centre' })?.ref).toBe('img-5');
  });

  it('decides what counts as licensed and operating', () => {
    const ok = { operationalStatus: 'Operational', registrationStatus: 'Registered', licenceStatus: null, accreditationStatus: null };
    expect(isRegistryVerified(ok)).toBe(true);
    expect(isRegistryVerified({ ...ok, licenceStatus: 'Licensed' })).toBe(true);
    expect(isRegistryVerified({ ...ok, licenceStatus: 'Expired' })).toBe(false);
    expect(isRegistryVerified({ ...ok, registrationStatus: 'Not Registered' })).toBe(false);
    expect(isRegistryVerified({ ...ok, registrationStatus: 'Pending' })).toBe(false);
    expect(isRegistryVerified({ ...ok, operationalStatus: 'Non-Operational' })).toBe(false);
    expect(isRegistryVerified({ ...ok, registrationStatus: null })).toBe(false); // no status, no automatic verification
    expect(isRegistryVerified({ operationalStatus: null, registrationStatus: null, licenceStatus: null, accreditationStatus: 'Accredited' })).toBe(true);
    expect(isOperational({ operationalStatus: 'Closed' })).toBe(false);
    expect(isOperational({ operationalStatus: null })).toBe(true);
  });
});

describe('national registry: the client', () => {
  it('sends the key, and turns errors into short codes', async () => {
    const calls: { url: string; key: string | null }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, key: new Headers(init?.headers).get('x-api-key') });
      return json(200, SAMPLE);
    }) as unknown as typeof fetch;
    const client = new HfrClient('hfr_test', 'https://hfr.example/', 1000, fetchImpl);
    const page = await client.list('facilities', 2, 100);
    expect(page.items[0].name).toBe('General Hospital Maitama');
    expect(calls[0]).toEqual({ url: 'https://hfr.example/api/v1/facilities?page=2&per_page=100&sort_by=updated_at&sort_order=asc', key: 'hfr_test' });

    const limited = new HfrClient('k', 'https://x', 1000, (async () => json(429, {}, { 'retry-after': '7' })) as unknown as typeof fetch);
    await expect(limited.list('facilities', 1, 100)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 7000 });
    const rejected = new HfrClient('k', 'https://x', 1000, (async () => json(403, { error: { code: 'API_KEY_EXPIRED' } })) as unknown as typeof fetch);
    await expect(rejected.list('facilities', 1, 100)).rejects.toMatchObject({ code: 'KEY_REJECTED' });
    await expect(new HfrClient(undefined).list('facilities', 1, 100)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(new HfrClient(undefined).configured).toBe(false);
  });

  it('waits and retries when rate limited, but gives up on a bad key', async () => {
    let n = 0;
    const client = {
      configured: true,
      list: async () => {
        n += 1;
        if (n < 3) throw new RegistryError('RATE_LIMITED', 5);
        return { items: [], page: 1, lastPage: 1, total: 0 };
      },
    };
    const svc = new FacilityRegistrySyncService({} as never, {} as never, {} as never, client);
    const waits: number[] = [];
    svc.minIntervalMs = 0;
    svc.sleep = async (ms) => { waits.push(ms); };
    await (svc as unknown as { fetchPage: (k: string, p: number) => Promise<unknown> }).fetchPage('facilities', 1);
    expect(n).toBe(3);
    expect(waits).toEqual([5, 5]);

    const bad = new FacilityRegistrySyncService({} as never, {} as never, {} as never, { configured: true, list: async () => { throw new RegistryError('KEY_REJECTED'); } });
    bad.sleep = async () => undefined;
    await expect((bad as unknown as { fetchPage: (k: string, p: number) => Promise<unknown> }).fetchPage('facilities', 1)).rejects.toMatchObject({ code: 'KEY_REJECTED' });
  });
});

describe('maps links and Google place IDs', () => {
  it('links to Google Maps with or without a place ID', () => {
    const base = { displayName: 'LUTH', city: 'Idi-Araba', stateOrRegion: 'Lagos', latitude: 6.5175, longitude: 3.3533 };
    expect(mapsLinks(base)).toEqual({
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=LUTH%2C%20Idi-Araba%2C%20Lagos',
      directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=6.5175,3.3533',
      onGoogle: false,
    });
    const withId = mapsLinks({ ...base, googlePlaceId: 'ChIJabc123xyz_' });
    expect(withId.mapsUrl).toContain('&query_place_id=ChIJabc123xyz_');
    expect(withId.directionsUrl).toContain('&destination_place_id=ChIJabc123xyz_');
    expect(mapsLinks({ displayName: 'X', latitude: null, longitude: null }).directionsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=X');
  });

  it('asks Google for IDs only, within a small box around the registry point', async () => {
    const seen: { headers: Headers; body: { textQuery: string; locationRestriction: { rectangle: { low: { latitude: number }; high: { latitude: number } } } } }[] = [];
    const matcher = new GooglePlaceMatcher({} as never, { get: (k: string) => (k === 'GOOGLE_PLACES_API_KEY' ? 'gk' : undefined) } as never);
    matcher.fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return json(200, { places: [{ id: 'ChIJ_match_0001' }] });
    }) as unknown as typeof fetch;
    expect(await matcher.find('LUTH', 6.5, 3.35)).toBe('ChIJ_match_0001');
    expect(seen[0].headers.get('x-goog-fieldmask')).toBe('places.id');
    expect(seen[0].body.textQuery).toBe('LUTH');
    const box = seen[0].body.locationRestriction.rectangle;
    expect(box.high.latitude - box.low.latitude).toBeCloseTo(0.005, 5);
    matcher.fetchImpl = (async () => json(200, {})) as unknown as typeof fetch;
    expect(await matcher.find('Nowhere', 6.5, 3.35)).toBeNull();
  });
});

describe('claim by code', () => {
  it('masks contacts so search never reveals them', () => {
    expect(maskPhone('+2348031234567')).toBe('+234 803 ••• ••67');
    expect(maskPhone('0803')).toBe('•••');
    expect(maskEmail('info@stjude.ng')).toBe('i•••@stjude.ng');
    expect(maskEmail('a@b.co')).toBe('a•••@b.co');
  });

  it('auto-verifies only a licensed facility whose contact was proved recently', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    expect(canAutoVerify({ registryVerified: true }, { ownershipVerifiedAt: new Date('2026-10-09T10:00:00Z') }, now)).toBe(true);
    expect(canAutoVerify({ registryVerified: false }, { ownershipVerifiedAt: new Date('2026-10-09T10:00:00Z') }, now)).toBe(false);
    expect(canAutoVerify({ registryVerified: true }, { ownershipVerifiedAt: null }, now)).toBe(false);
    expect(canAutoVerify({ registryVerified: true }, { ownershipVerifiedAt: new Date('2026-09-01T10:00:00Z') }, now)).toBe(false);
  });

  it('picks the SMS provider from settings, never the test one in production', () => {
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'termii', TERMII_API_KEY: 'k', TERMII_SENDER_ID: 'SmartClinic' })).toBeInstanceOf(TermiiSmsProvider);
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'africastalking', AFRICASTALKING_USERNAME: 'u', AFRICASTALKING_API_KEY: 'k' })).toBeInstanceOf(AfricasTalkingSmsProvider);
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'termii' })).toBeNull();
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'test', NODE_ENV: 'production' })).toBeNull();
    expect(smsProviderFromEnv({})).toBeNull();
  });

  it('sends Termii messages on the DND route without the plus sign', async () => {
    let body: Record<string, string> = {};
    const sms = new TermiiSmsProvider('k', 'SmartClinic', 'https://termii.example', (async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return json(200, { message_id: '1' });
    }) as unknown as typeof fetch);
    expect(await sms.send('+2348031234567', 'hi')).toBe(true);
    expect(body).toMatchObject({ to: '2348031234567', from: 'SmartClinic', channel: 'dnd', sms: 'hi' });
  });
});
