import { en } from './en';
import { fr } from './fr';
import { ha } from './ha';
import { ig } from './ig';
import { pcm } from './pcm';
import { rw } from './rw';
import { sw } from './sw';
import { tw } from './tw';
import type { PlayServerText } from './types';
import { yo } from './yo';

export const PLAY_TEXT: Readonly<Record<string, PlayServerText>> = { en, pcm, yo, ha, ig, rw, fr, sw, tw };

export function playText(language: string): PlayServerText {
  return PLAY_TEXT[language] ?? en;
}

export function fill(s: string, params: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (w, k: string) => (params[k] === undefined ? w : String(params[k])));
}

export type { PlayServerText, Text } from './types';
