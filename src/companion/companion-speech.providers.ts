import { SpeechProviderKey, VoiceChoice } from './companion.languages';

export interface SpeechAudio {
  readonly audio: Buffer;
  readonly contentType: string;
}

export interface SpeechSettings {
  readonly spitchKey?: string;
  readonly azureKey?: string;
  readonly azureRegion?: string;
  readonly khayaKey?: string;
  readonly openAiKey?: string;
  readonly openAiModel: string;
  readonly customRwUrl?: string;
  readonly timeoutMs: number;
}

export class SpeechProviderError extends Error {}

type Fetch = typeof fetch;

/** Which providers have credentials, so the plan can skip the rest without a network call. */
export function configured(settings: SpeechSettings, provider: SpeechProviderKey): boolean {
  switch (provider) {
    case 'spitch': return Boolean(settings.spitchKey);
    case 'azure': return Boolean(settings.azureKey && settings.azureRegion);
    case 'khaya': return Boolean(settings.khayaKey);
    case 'openai': return Boolean(settings.openAiKey);
    case 'custom': return Boolean(settings.customRwUrl);
  }
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

async function call(f: Fetch, url: string, init: RequestInit, timeoutMs: number, contentType: string): Promise<SpeechAudio> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await f(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new SpeechProviderError(`speech provider returned ${res.status}`);
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new SpeechProviderError('speech provider returned no audio');
    return { audio, contentType: res.headers.get('content-type')?.split(';')[0] || contentType };
  } catch (e) {
    throw e instanceof SpeechProviderError ? e : new SpeechProviderError('speech provider unreachable');
  } finally {
    clearTimeout(timer);
  }
}

/** One synthesis request to one provider. Text is never logged. */
export function synthesize(settings: SpeechSettings, choice: VoiceChoice, text: string, f: Fetch = fetch): Promise<SpeechAudio> {
  const t = settings.timeoutMs;
  switch (choice.provider) {
    case 'spitch':
      return call(f, 'https://api.spitch.app/v1/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.spitchKey}`, 'Content-Type': 'application/json', 'X-Data-Retention': 'false' },
        body: JSON.stringify({ text, voice: choice.voice, language: choice.language, format: 'mp3', speed: 0.95 }),
      }, t, 'audio/mpeg');
    case 'azure': {
      const ssml = `<speak version="1.0" xml:lang="${choice.language}"><voice name="${choice.voice}"><prosody rate="-5%">${escapeXml(text)}</prosody></voice></speak>`;
      return call(f, `https://${settings.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': settings.azureKey!,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'smartclinic-companion',
        },
        body: ssml,
      }, t, 'audio/mpeg');
    }
    case 'khaya':
      return call(f, 'https://translation-api.ghananlp.org/tts/v1/tts', {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': settings.khayaKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: choice.language, speaker_id: 'female' }),
      }, t, 'audio/wav');
    case 'openai':
      return call(f, 'https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.openAiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.openAiModel,
          voice: choice.voice,
          input: text,
          response_format: 'mp3',
          instructions: 'Speak warmly, calmly and a little slowly, like a kind community nurse explaining something to a neighbour. Clear, friendly, never rushed.',
        }),
      }, t, 'audio/mpeg');
    case 'custom':
      return call(f, settings.customRwUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: choice.language }),
      }, t, 'audio/wav');
  }
}
