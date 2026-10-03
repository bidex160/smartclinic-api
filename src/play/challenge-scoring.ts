import { ChallengeTheme } from './play.entities';
import { MAX_GUESSES } from './health-word.content';

/** What one person did on one day. Only healthy actions; never readings or results. */
export interface DayActivity {
  checkIn: boolean;
  routine: boolean;
  quizAnswered: boolean;
  quizCorrect: boolean;
  wordFinished: boolean;
  wordSolved: boolean;
  wordGuesses: number;
  wordSeconds: number | null;
}

export const EMPTY_DAY: DayActivity = {
  checkIn: false, routine: false, quizAnswered: false, quizCorrect: false,
  wordFinished: false, wordSolved: false, wordGuesses: 0, wordSeconds: null,
};

/** Points per day by theme. Each action counts once a day, so the most anyone can score is capped. */
export const THEME_RULES: Readonly<Record<ChallengeTheme, { maxPerDay: number; describe: string }>> = {
  [ChallengeTheme.ALL_ROUND]: { maxPerDay: 30, describe: 'Active day 10, daily question 5 (+5 right), Health Word 5 (+5 solved)' },
  [ChallengeTheme.WORD]: { maxPerDay: 20, describe: 'Solved: 10, plus 2 for every try left. Played but not solved: 2' },
  [ChallengeTheme.QUIZ]: { maxPerDay: 15, describe: 'Answered 5, right 10 more' },
  [ChallengeTheme.ACTIVE_DAYS]: { maxPerDay: 10, describe: 'Check-in 5, a routine ticked 5' },
};

export function dayScore(theme: ChallengeTheme, d: DayActivity): number {
  switch (theme) {
    case ChallengeTheme.WORD:
      if (d.wordSolved) return 10 + Math.max(0, MAX_GUESSES - d.wordGuesses) * 2;
      return d.wordFinished ? 2 : 0;
    case ChallengeTheme.QUIZ:
      return (d.quizAnswered ? 5 : 0) + (d.quizCorrect ? 10 : 0);
    case ChallengeTheme.ACTIVE_DAYS:
      return (d.checkIn ? 5 : 0) + (d.routine ? 5 : 0);
    case ChallengeTheme.ALL_ROUND:
    default:
      return (d.checkIn || d.routine ? 10 : 0) + (d.quizAnswered ? 5 : 0) + (d.quizCorrect ? 5 : 0) + (d.wordFinished ? 5 : 0) + (d.wordSolved ? 5 : 0);
  }
}

export interface Standing {
  key: string;
  score: number;
  daysActive: number;
  /** Lower is better; only used to split ties in Health Word challenges. */
  wordSeconds: number;
  doneToday: boolean;
  rank: number;
}

/**
 * Totals for each person over the dates, best first. Ties share a rank (1, 1, 3).
 * A day counts as active when it scored anything.
 */
export function standings(
  theme: ChallengeTheme,
  people: readonly { key: string; days: ReadonlyMap<string, DayActivity> }[],
  dates: readonly string[],
  today: string,
): Standing[] {
  const rows = people.map((p) => {
    let score = 0;
    let daysActive = 0;
    let wordSeconds = 0;
    for (const date of dates) {
      const d = p.days.get(date) ?? EMPTY_DAY;
      const s = dayScore(theme, d);
      score += s;
      if (s > 0) daysActive += 1;
      if (d.wordSolved && d.wordSeconds !== null) wordSeconds += d.wordSeconds;
    }
    const doneToday = dayScore(theme, p.days.get(today) ?? EMPTY_DAY) > 0;
    return { key: p.key, score, daysActive, wordSeconds, doneToday, rank: 0 };
  });
  const useTime = theme === ChallengeTheme.WORD;
  rows.sort((a, b) => b.score - a.score || (useTime ? a.wordSeconds - b.wordSeconds : 0) || b.daysActive - a.daysActive);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tied = prev && prev.score === r.score && (!useTime || prev.wordSeconds === r.wordSeconds);
    r.rank = tied ? prev.rank : i + 1;
  });
  return rows;
}

/** Every date from start to end, inclusive (YYYY-MM-DD). */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the week containing the date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return addDays(date, -back);
}

/** "Ada O." — first name and an initial, nothing more. */
export function publicName(given: string | null | undefined, family: string | null | undefined): string {
  const first = String(given ?? '').trim().split(/\s+/)[0] || 'Friend';
  const initial = String(family ?? '').trim().charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}
