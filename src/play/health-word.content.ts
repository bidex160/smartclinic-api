import { playText } from './i18n';

/**
 * Health Word: one five-letter health word a day, six tries, the same word for everyone on the same date.
 * Words stay on the server so the answer is never in the website code. Add words to the end only;
 * never reorder or change an id, because games are stored against it.
 * Facts are general health literacy (WHO / CDC guidance), not personal medical advice.
 */
export type WordCategory = 'body' | 'food' | 'move' | 'care' | 'mind';

export interface HealthWord {
  id: string;
  word: string;
  category: WordCategory;
}

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
/** Puzzle #1 was played on this date. */
export const FIRST_PUZZLE_DATE = '2026-10-01';

export const HEALTH_WORDS: readonly HealthWord[] = [
  { id: 'w01', word: 'HEART', category: 'body' },
  { id: 'w02', word: 'WATER', category: 'food' },
  { id: 'w03', word: 'SLEEP', category: 'mind' },
  { id: 'w04', word: 'MANGO', category: 'food' },
  { id: 'w05', word: 'STEPS', category: 'move' },
  { id: 'w06', word: 'BLOOD', category: 'body' },
  { id: 'w07', word: 'RELAX', category: 'mind' },
  { id: 'w08', word: 'BEANS', category: 'food' },
  { id: 'w09', word: 'HANDS', category: 'care' },
  { id: 'w10', word: 'LUNGS', category: 'body' },
  { id: 'w11', word: 'DANCE', category: 'move' },
  { id: 'w12', word: 'FRUIT', category: 'food' },
  { id: 'w13', word: 'PULSE', category: 'body' },
  { id: 'w14', word: 'LAUGH', category: 'mind' },
  { id: 'w15', word: 'CHECK', category: 'care' },
  { id: 'w16', word: 'TEETH', category: 'body' },
  { id: 'w17', word: 'SQUAT', category: 'move' },
  { id: 'w18', word: 'LEMON', category: 'food' },
  { id: 'w19', word: 'GERMS', category: 'care' },
  { id: 'w20', word: 'BRAIN', category: 'body' },
  { id: 'w21', word: 'PEACE', category: 'mind' },
  { id: 'w22', word: 'GRAIN', category: 'food' },
  { id: 'w23', word: 'LIVER', category: 'body' },
  { id: 'w24', word: 'PLANK', category: 'move' },
  { id: 'w25', word: 'SMILE', category: 'mind' },
  { id: 'w26', word: 'FEVER', category: 'care' },
  { id: 'w27', word: 'ONION', category: 'food' },
  { id: 'w28', word: 'SPINE', category: 'body' },
  { id: 'w29', word: 'NURSE', category: 'care' },
  { id: 'w30', word: 'MELON', category: 'food' },
  { id: 'w31', word: 'BONES', category: 'body' },
  { id: 'w32', word: 'COUGH', category: 'care' },
  { id: 'w33', word: 'HABIT', category: 'mind' },
  { id: 'w34', word: 'GUAVA', category: 'food' },
  { id: 'w35', word: 'NERVE', category: 'body' },
  { id: 'w36', word: 'SPORT', category: 'move' },
  { id: 'w37', word: 'CLEAN', category: 'care' },
  { id: 'w38', word: 'SUGAR', category: 'food' },
  { id: 'w39', word: 'SALAD', category: 'food' },
  { id: 'w40', word: 'JOINT', category: 'body' },
  { id: 'w41', word: 'VITAL', category: 'care' },
  { id: 'w42', word: 'APPLE', category: 'food' },
  { id: 'w43', word: 'KNEES', category: 'body' },
  { id: 'w44', word: 'DRINK', category: 'food' },
  { id: 'w45', word: 'SCALE', category: 'care' },
  { id: 'w46', word: 'HAPPY', category: 'mind' },
  { id: 'w47', word: 'WAIST', category: 'body' },
  { id: 'w48', word: 'FIBRE', category: 'food' },
];

export function wordFact(language: string, id: string): string {
  return playText(language).facts[id] ?? playText('en').facts[id] ?? '';
}

function dayNumber(localDate: string): number {
  return Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86_400_000);
}

export function puzzleNumber(localDate: string): number {
  return dayNumber(localDate) - dayNumber(FIRST_PUZZLE_DATE) + 1;
}

export function wordForDate(localDate: string): HealthWord {
  const n = HEALTH_WORDS.length;
  const i = (((puzzleNumber(localDate) - 1) % n) + n) % n;
  return HEALTH_WORDS[i];
}

export type LetterMark = 'hit' | 'near' | 'miss';

/** Standard scoring: right letter right place, right letter wrong place, or not in the word. Repeated letters are counted fairly. */
export function markGuess(guess: string, answer: string): LetterMark[] {
  const g = guess.toUpperCase().split('');
  const a = answer.toUpperCase().split('');
  const marks: LetterMark[] = g.map(() => 'miss');
  const left: Record<string, number> = {};
  g.forEach((ch, i) => {
    if (ch === a[i]) marks[i] = 'hit';
    else left[a[i]] = (left[a[i]] ?? 0) + 1;
  });
  g.forEach((ch, i) => {
    if (marks[i] === 'hit') return;
    if ((left[ch] ?? 0) > 0) {
      marks[i] = 'near';
      left[ch] -= 1;
    }
  });
  return marks;
}

export function normaliseGuess(raw: string): string | null {
  const g = String(raw ?? '').trim().toUpperCase();
  return new RegExp(`^[A-Z]{${WORD_LENGTH}}$`).test(g) ? g : null;
}
