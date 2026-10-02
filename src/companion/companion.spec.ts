import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

import { configured, synthesize } from './companion-speech.providers';
import { CompanionAskDto, RateBudget } from './companion.controller';
import { COMPANION_LANGUAGES, voicePlan } from './companion.languages';
import { CompanionService } from './companion.service';

const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as any;

describe('companion voice plan', () => {
  it('has a plan for every language, with native voices first', () => {
    for (const lang of COMPANION_LANGUAGES) expect(voicePlan(lang, 'female', null, 'pcm').length).toBeGreaterThan(0);
    expect(voicePlan('yo', 'male', null, 'pcm')[0]).toEqual({ provider: 'spitch', language: 'yo', voice: 'femi' });
    expect(voicePlan('sw', 'female', null, 'pcm')[0]).toMatchObject({ provider: 'azure', voice: 'sw-KE-ZuriNeural' });
    expect(voicePlan('en', 'female', 'RW', 'pcm')[0]).toMatchObject({ provider: 'azure', language: 'en-KE' });
    expect(voicePlan('en', 'female', 'NG', 'pcm')[0]).toMatchObject({ provider: 'spitch', voice: 'lucy' });
  });
});

describe('speech providers', () => {
  const settings = { spitchKey: 'k', azureKey: 'a', azureRegion: 'westeurope', openAiModel: 'gpt-4o-mini-tts', timeoutMs: 1000 };
  const ok = (type = 'audio/mpeg') => jest.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': type } }));

  it('asks Spitch not to keep the text, and escapes text sent to Azure', async () => {
    const f = ok();
    await synthesize(settings, { provider: 'spitch', language: 'ha', voice: 'amina' }, 'Sannu', f as any);
    const [, init] = f.mock.calls[0] as any;
    expect(init.headers['X-Data-Retention']).toBe('false');
    expect(JSON.parse(init.body)).toMatchObject({ text: 'Sannu', voice: 'amina', language: 'ha', format: 'mp3' });

    const g = ok();
    await synthesize(settings, { provider: 'azure', language: 'fr-FR', voice: 'fr-FR-DeniseNeural' }, 'A < B & "C"', g as any);
    const [url, azure] = g.mock.calls[0] as any;
    expect(url).toBe('https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(azure.body).toContain('A &lt; B &amp; &quot;C&quot;');
  });

  it('only counts providers that have keys', () => {
    expect(configured(settings, 'spitch')).toBe(true);
    expect(configured(settings, 'khaya')).toBe(false);
    expect(configured({ ...settings, azureRegion: undefined }, 'azure')).toBe(false);
  });
});

describe('CompanionService', () => {
  it('falls back to the next voice when the first fails, and caches the result', async () => {
    const service = new CompanionService(config({ SPITCH_API_KEY: 'k', AZURE_SPEECH_KEY: 'a', AZURE_SPEECH_REGION: 'eu' }));
    const calls: string[] = [];
    const real = global.fetch;
    global.fetch = jest.fn(async (url: any) => {
      calls.push(String(url));
      if (String(url).includes('spitch')) return new Response('', { status: 500 });
      return new Response(new Uint8Array([9]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }) as any;
    try {
      const first = await service.speak({ text: 'Hello there', language: 'en', character: 'zainab', country: 'NG' });
      expect(first.audio.length).toBe(1);
      expect(calls.some((u) => u.includes('spitch'))).toBe(true);
      expect(calls.some((u) => u.includes('microsoft'))).toBe(true);
      const before = calls.length;
      await service.speak({ text: 'Hello there', language: 'en', character: 'zainab', country: 'NG' });
      expect(calls.length).toBe(before + 1); // spitch tried again (not cached), azure answer served from cache
    } finally {
      global.fetch = real;
    }
  });

  it('says plainly when a language has no voice yet', async () => {
    const service = new CompanionService(config({ SPITCH_API_KEY: 'k' }));
    await expect(service.speak({ text: 'Muraho', language: 'rw', character: 'ayo' })).rejects.toBeInstanceOf(HttpException);
    expect(service.capabilities().voices).toMatchObject({ yo: true, rw: false, sw: false });
  });

  it('answers emergencies straight away, in the chosen language, without calling the model', async () => {
    const service = new CompanionService(config({}));
    const a = await service.answer({ language: 'fr', character: 'ayo', question: "J'ai une douleur thoracique" });
    expect(a).toMatchObject({ urgent: true, route: null });
    expect(a.body).toContain('112');
    await expect(service.answer({ language: 'en', character: 'ayo', question: 'How do I book?' })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses the model with safety rules, drops routes outside the app, and caches topics only', async () => {
    const service = new CompanionService(config({ COMPANION_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'x' }));
    const create = jest.fn(async (_body: any) => ({ output_text: JSON.stringify({ title: 'Sannu', body: 'Danna Find Care.', route: '/evil', action: 'Je', urgent: false }) }));
    service.useClient({ responses: { create } } as any);
    const a = await service.answer({ language: 'ha', character: 'zainab', topic: 'find-care' });
    expect(a).toMatchObject({ title: 'Sannu', route: null, action: null, language: 'ha' });
    const body = create.mock.calls[0][0];
    expect(body.store).toBe(false);
    expect(body.instructions).toContain('Hausa');
    expect(body.instructions).toContain('must not: diagnose');
    await service.answer({ language: 'ha', character: 'zainab', topic: 'find-care' });
    expect(create).toHaveBeenCalledTimes(1);
    await service.answer({ language: 'ha', character: 'zainab', question: 'Ina asibiti?' });
    await service.answer({ language: 'ha', character: 'zainab', question: 'Ina asibiti?' });
    expect(create).toHaveBeenCalledTimes(3);
  });
});

describe('companion guards', () => {
  it('limits requests per address', () => {
    const budget = new RateBudget(2, 1000);
    expect([budget.take('a', 0), budget.take('a', 1), budget.take('a', 2), budget.take('b', 2), budget.take('a', 1500)]).toEqual([true, true, false, true, true]);
  });

  it('rejects unknown languages and odd page paths', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ language: 'xx', character: 'ayo', question: 'hi' }, { type: 'body', metatype: CompanionAskDto })).rejects.toBeDefined();
    await expect(pipe.transform({ language: 'rw', character: 'ayo', question: 'hi', page: 'javascript:alert(1)' }, { type: 'body', metatype: CompanionAskDto })).rejects.toBeDefined();
    await expect(pipe.transform({ language: 'rw', character: 'kito', topic: 'passport', page: '/me/health' }, { type: 'body', metatype: CompanionAskDto })).resolves.toMatchObject({ language: 'rw' });
  });
});
