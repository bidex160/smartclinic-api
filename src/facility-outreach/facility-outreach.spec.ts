import { csvObjects, parseCsv } from './csv';
import { facilityTypeFrom, inviteText, nextAction, providerTypeFor } from './facility-outreach.service';
import { normalizePhone, normalizeState } from './places';
import { PartnerFacilityType } from '../patient-provider-connections/entities/partner-facility-listing.entity';
import { ProviderType } from '../providers/enums/provider-type.enum';

describe('place names', () => {
  it('gives Abuja one spelling and drops "State"', () => {
    for (const v of ['FCT', 'f.c.t.', 'Abuja', 'Abuja Federal Capital Territory', 'federal capital territory']) expect(normalizeState('NG', v)).toBe('Federal Capital Territory');
    expect(normalizeState('NG', 'lagos state')).toBe('Lagos');
    expect(normalizeState('NG', 'Akwa-Ibom')).toBe('Akwa Ibom');
    expect(normalizeState('RW', 'Kigali')).toBe('City of Kigali');
    expect(normalizeState('GH', 'accra')).toBe('Greater Accra');
    expect(normalizeState('NG', '')).toBeNull();
    expect(normalizeState('NG', 'somewhere new')).toBe('Somewhere New');
  });

  it('tidies phone numbers into international form', () => {
    expect(normalizePhone('NG', '0803 123 4567')).toBe('+2348031234567');
    expect(normalizePhone('RW', '0788-123-456')).toBe('+250788123456');
    expect(normalizePhone('GH', '00233 24 123 4567')).toBe('+233241234567');
    expect(normalizePhone('NG', '2348031234567')).toBe('+2348031234567');
    expect(normalizePhone('NG', 'call me')).toBeNull();
  });
});

describe('CSV import parsing', () => {
  it('reads quoted fields, semicolons and Windows line endings', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('name;city\nKing Faisal;Kigali\n')).toEqual([['name', 'city'], ['King Faisal', 'Kigali']]);
    expect(csvObjects('Name,Contact Name,Phone Number\nA,B,C\n\n')).toEqual([{ name: 'A', contact_name: 'B', phone_number: 'C' }]);
  });

  it('maps facility words to types and sign-up types', () => {
    expect(facilityTypeFrom('General Hospital')).toBe(PartnerFacilityType.HOSPITAL);
    expect(facilityTypeFrom('Clinic')).toBe(PartnerFacilityType.HOSPITAL);
    expect(facilityTypeFrom('Pharmacy')).toBe(PartnerFacilityType.PHARMACY);
    expect(facilityTypeFrom('Diagnostic lab')).toBe(PartnerFacilityType.LABORATORY);
    expect(facilityTypeFrom('Imaging centre')).toBe(PartnerFacilityType.RADIOLOGY);
    expect(facilityTypeFrom('spa')).toBeNull();
    expect(providerTypeFor(PartnerFacilityType.LABORATORY)).toBe(ProviderType.DIAGNOSTIC_CENTRE);
    expect(providerTypeFor(PartnerFacilityType.HOSPITAL)).toBe(ProviderType.HOSPITAL);
  });
});

describe('outreach messages and next steps', () => {
  it('leads with patient demand when there is some', () => {
    expect(inviteText('Ikeja General', 'Ikeja', 12, 'https://x/claim/t')).toBe('Hello Ikeja General, 12 patients have asked for you on SmartClinic in Ikeja. Claim your free listing to receive their requests and get paid: https://x/claim/t');
    expect(inviteText('KFH', null, 0, 'u')).toContain('patients are finding care on SmartClinic');
  });

  it('tells staff what to do next', () => {
    const base = { phone: null, whatsapp: null, email: null, invitesSent: 0, lastContactAt: null, reminderStage: 0 };
    const now = new Date('2026-10-10T10:00:00Z');
    expect(nextAction('LISTED', base, now)).toBe('Add a phone number, WhatsApp or email');
    expect(nextAction('LISTED', { ...base, phone: '+234' }, now)).toBe('Send the invite');
    expect(nextAction('CONTACTED', { ...base, invitesSent: 1, lastContactAt: new Date('2026-10-09T10:00:00Z') }, now)).toContain('Invited 1 day ago');
    expect(nextAction('CONTACTED', { ...base, invitesSent: 1, lastContactAt: new Date('2026-10-01T10:00:00Z'), reminderStage: 2 }, now)).toContain('Call them');
    expect(nextAction('CLAIMED', base, now)).toContain('check their licence');
    expect(nextAction('LIVE', base, now)).toContain('Live');
  });
});
