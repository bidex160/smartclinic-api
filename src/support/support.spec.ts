import { HttpException, ValidationPipe } from '@nestjs/common';

import { CreateSupportCallbackDto } from './support.dto';
import { SupportCallbackStatus, SupportCallbackTime, SupportCallbackTopic } from './support-callback-request.entity';
import { normalisePhone, SupportService } from './support.service';

describe('SupportService', () => {
  const env = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;
  let rows: any[];
  let repo: any;
  const make = (values: Record<string, string> = {}) => new SupportService(repo, env(values));

  beforeEach(() => {
    rows = [];
    repo = {
      count: jest.fn(async ({ where }: any) => rows.filter((r) => r.phone === where.phone).length),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        const row = { createdAt: new Date(), ...v };
        const at = rows.findIndex((r) => r.reference === row.reference);
        if (at >= 0) rows[at] = row;
        else rows.push(row);
        return row;
      }),
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.reference === where.reference) ?? null),
      findAndCount: jest.fn(async () => [rows, rows.length]),
    };
  });

  it('normalises phone numbers and rejects anything else', () => {
    expect(normalisePhone('+234 803-000 0000')).toBe('+2348030000000');
    expect(normalisePhone('(024) 412 3456')).toBe('0244123456');
    expect(normalisePhone('call me')).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
  });

  it('serves a default help line and per-country numbers that fall back to it', () => {
    const contacts = make({ SUPPORT_PHONE: '+234 700 000 0000', SUPPORT_WHATSAPP: '+234 800 000 0000', SUPPORT_PHONE_GH: '+233 30 000 0000', SUPPORT_HOURS: 'Mon–Sat, 8am–8pm' }).contacts();
    expect(contacts.default).toEqual({ phone: '+2347000000000', whatsapp: '+2348000000000', hours: 'Mon–Sat, 8am–8pm' });
    expect(contacts.countries.GH).toEqual({ phone: '+233300000000', whatsapp: '+2348000000000', hours: 'Mon–Sat, 8am–8pm' });
    expect(contacts.countries.RW.phone).toBe('+2347000000000');
  });

  it('returns nulls when no numbers are set, so the app can hide the buttons', () => {
    expect(make().contacts().default).toEqual({ phone: null, whatsapp: null, hours: null });
  });

  it('takes a callback request without an account and caps repeats per phone', async () => {
    const service = make();
    const dto = { name: 'Mama Ngozi', phone: '0803 000 0000', countryCode: 'NG', topic: SupportCallbackTopic.BOOK_CHECKUP } as CreateSupportCallbackDto;
    const first = await service.requestCallback(dto, null);
    expect(first).toMatchObject({ status: 'OPEN', preferredTime: 'ANYTIME' });
    expect(first.reference).toMatch(/^SC-CB-[0-9A-F]{8}$/);
    expect(rows[0]).toMatchObject({ phone: '08030000000', userId: null });
    await service.requestCallback(dto, { id: 'user-1' } as any);
    await service.requestCallback(dto, null);
    await expect(service.requestCallback(dto, null)).rejects.toBeInstanceOf(HttpException);
  });

  it('lets staff mark a request called and reopen it', async () => {
    const service = make();
    const { reference } = await service.requestCallback({ name: 'Ama', phone: '+233244123456', topic: SupportCallbackTopic.OTHER, preferredTime: SupportCallbackTime.EVENING } as any, null);
    const called = await service.update(reference, { status: SupportCallbackStatus.CALLED, staffNote: 'Booked Basic check' }, { id: 'staff-1' } as any);
    expect(called).toMatchObject({ status: 'CALLED', staffNote: 'Booked Basic check', preferredTime: 'EVENING' });
    expect(rows[0]).toMatchObject({ handledByUserId: 'staff-1' });
    await service.update(reference, { status: SupportCallbackStatus.OPEN }, { id: 'staff-1' } as any);
    expect(rows[0]).toMatchObject({ handledByUserId: null, handledAt: null });
  });

  it('validates the request form', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const run = (value: unknown) => pipe.transform(value, { type: 'body', metatype: CreateSupportCallbackDto });
    await expect(run({ name: ' Ada ', phone: '+234 803 000 0000', topic: 'SEE_DOCTOR' })).resolves.toMatchObject({ name: 'Ada' });
    await expect(run({ name: 'Ada', phone: 'not a phone', topic: 'SEE_DOCTOR' })).rejects.toBeDefined();
    await expect(run({ name: 'Ada', phone: '+2348030000000', topic: 'SOMETHING' })).rejects.toBeDefined();
  });
});

describe('language feedback', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scrub, LanguageFeedbackService } = require('./language-feedback');
  it('removes emails and phone numbers people paste by mistake', () => {
    expect(scrub('Call me on +250 788 123 456 or ada@example.test  please')).toBe('Call me on [number] or [email] please');
  });
  it('saves a report as open, with at most five matching keys', async () => {
    const saved: Record<string, unknown>[] = [];
    const repo = { create: (r: Record<string, unknown>) => r, save: async (r: Record<string, unknown>) => { saved.push(r); return { ...r, id: 'f1' }; } };
    const svc = new LanguageFeedbackService(repo);
    await expect(svc.create({ language: 'rw', shownText: ' Ikinyuranyo cy’isaha ', suggestion: 'Isaha y’aho uri', page: '/me/play', catalogKeys: ['a.b', 'a.b', 'c.d'] })).resolves.toEqual({ id: 'f1', received: true });
    expect(saved[0]).toMatchObject({ language: 'rw', shownText: 'Ikinyuranyo cy’isaha', suggestion: 'Isaha y’aho uri', page: '/me/play', catalogKeys: ['a.b', 'c.d'], status: 'OPEN' });
  });
});
