/** Languages the companion can answer in, and who (if anyone) can speak each one naturally. */
export const COMPANION_LANGUAGES = ['en', 'pcm', 'yo', 'ha', 'ig', 'rw', 'fr', 'sw', 'tw'] as const;
export type CompanionLanguage = (typeof COMPANION_LANGUAGES)[number];

export const COMPANION_CHARACTERS = ['ayo', 'zainab', 'kito'] as const;
export type CompanionCharacter = (typeof COMPANION_CHARACTERS)[number];

export const LANGUAGE_NAMES: Readonly<Record<CompanionLanguage, string>> = {
  en: 'English',
  pcm: 'Nigerian Pidgin',
  yo: 'Yoruba',
  ha: 'Hausa',
  ig: 'Igbo',
  rw: 'Kinyarwanda',
  fr: 'French',
  sw: 'Swahili',
  tw: 'Twi (Akan)',
};

export const CHARACTER_NAMES: Readonly<Record<CompanionCharacter, string>> = { ayo: 'Ayo', zainab: 'Zainab', kito: 'Kito' };

/** Ayo speaks with a man's voice; Zainab and Kito with a woman's. */
export const CHARACTER_VOICE: Readonly<Record<CompanionCharacter, 'male' | 'female'>> = { ayo: 'male', zainab: 'female', kito: 'female' };

export type SpeechProviderKey = 'spitch' | 'azure' | 'khaya' | 'openai' | 'custom';

export interface VoiceChoice {
  readonly provider: SpeechProviderKey;
  /** Provider language code (or BCP-47 locale for Azure). */
  readonly language: string;
  readonly voice: string;
}

/**
 * Best voice first, then fallbacks. Native African voices lead (Spitch for Nigerian languages,
 * Azure for Swahili, French and East African English, Khaya for Twi); OpenAI is the last resort.
 */
export function voicePlan(language: CompanionLanguage, gender: 'male' | 'female', country: string | null, pidginCode: string): VoiceChoice[] {
  const m = gender === 'male';
  const openai = (lang: string): VoiceChoice => ({ provider: 'openai', language: lang, voice: m ? 'ash' : 'coral' });
  switch (language) {
    case 'en':
      return country === 'RW'
        ? [{ provider: 'azure', language: 'en-KE', voice: m ? 'en-KE-ChilembaNeural' : 'en-KE-AsiliaNeural' }, { provider: 'spitch', language: 'en', voice: m ? 'john' : 'lucy' }, openai('en')]
        : [{ provider: 'spitch', language: 'en', voice: m ? 'john' : 'lucy' }, { provider: 'azure', language: 'en-NG', voice: m ? 'en-NG-AbeoNeural' : 'en-NG-EzinneNeural' }, openai('en')];
    case 'pcm':
      return [
        { provider: 'spitch', language: pidginCode, voice: m ? 'justice' : 'tega' },
        { provider: 'spitch', language: 'en', voice: m ? 'justice' : 'tega' },
        { provider: 'azure', language: 'en-NG', voice: m ? 'en-NG-AbeoNeural' : 'en-NG-EzinneNeural' },
      ];
    case 'yo':
      return [{ provider: 'spitch', language: 'yo', voice: m ? 'femi' : 'sade' }];
    case 'ha':
      return [{ provider: 'spitch', language: 'ha', voice: m ? 'aliyu' : 'amina' }];
    case 'ig':
      return [{ provider: 'spitch', language: 'ig', voice: m ? 'obinna' : 'ngozi' }];
    case 'fr':
      return [{ provider: 'azure', language: 'fr-FR', voice: m ? 'fr-FR-HenriNeural' : 'fr-FR-DeniseNeural' }, openai('fr')];
    case 'sw':
      return [{ provider: 'azure', language: 'sw-KE', voice: m ? 'sw-KE-RafikiNeural' : 'sw-KE-ZuriNeural' }];
    case 'tw':
      return [{ provider: 'khaya', language: 'tw', voice: 'female' }];
    case 'rw':
      // No commercial Kinyarwanda voice exists yet; a self-hosted model can be plugged in via COMPANION_TTS_RW_URL.
      return [{ provider: 'custom', language: 'rw', voice: 'default' }];
  }
}

/** Places the companion may send people. Anything else the model suggests is dropped. */
export const COMPANION_ROUTES: Readonly<Record<string, string>> = {
  '/me/dashboard': 'Home: daily routines, check-in, next step',
  '/me/health-journey': 'Stay Well: Guided Self-Check and Health Checks',
  '/me/self-checks': 'Guided Self-Check: answer simple health questions at home',
  '/me/book': 'Book a Smart Health Check at home or at a clinic',
  '/me/health-checks': 'My Health Checks and results',
  '/me/request-care': 'Find Care: see a doctor (online, at home, or in person)',
  '/me/orders': 'Tests & Referrals',
  '/me/prescriptions': 'My prescriptions',
  '/me/health-passport': 'Smart Health Passport: records, readings, sharing',
  '/me/health-records': 'Health Records and who can see them',
  '/me/profile': 'Me: profile, blood group, genotype, allergies, emergency contact',
  '/me/card': 'SmartClinic card with QR code to show at a clinic',
  '/me/progress': 'My progress: points, level, badges, daily health question',
  '/me/family': 'Family health: care for children and relatives',
  '/me/providers/connect': 'Connect My Hospital',
  '/me/pay-bills': 'Pay hospital bills',
  '/help': 'Talk to a person: call, WhatsApp, or ask for a call back',
  '/health-check/packages': 'Health Check packages and prices',
};

/** Topics the app can ask about by name. These answers are the same for everyone, so they are cached. */
export const COMPANION_TOPICS: Readonly<Record<string, string>> = {
  welcome: 'Greet the person in one or two short sentences, say your name, and ask what they would like to do today.',
  'stay-well': 'Explain Stay Well: Guided Self-Check (answer questions at home) and Smart Health Check (a provider checks you, at home or at a clinic).',
  'find-care': 'Explain Find Care: describe the problem, choose online, home visit or in-person, check provider, price and time, then confirm. Emergencies go to the hospital now.',
  hospital: 'Explain My Hospital: connect a hospital you already use to see bills, appointments, receipts and records.',
  appointments: 'Explain why booking an appointment helps and the steps: care needed, provider, date and time, check price, confirm.',
  passport: 'Explain the Smart Health Passport: one place for checks, results and care history; you choose what to share and for how long.',
  network: 'Explain My Impact: invite others with your link; verified invitations earn referral points.',
  points: 'Explain wellness points: earned for the daily health question, check-ins, routines and completing your passport; they can take up to 20% off a Smart Health Check and are not cash.',
  'know-numbers': 'Explain why knowing your blood group and genotype matters, and that SmartClinic can arrange the test at home or at a lab.',
};
