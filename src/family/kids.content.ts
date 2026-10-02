/**
 * Kids corner content. The server keeps only ids and answers; the words and pictures live in the
 * app's translation files (kids.task.<key>, kids.quiz.<id>.*), so every language gets the same game.
 */

/** Tasks a parent can set. Healthy, simple, age-appropriate; nothing a child does alone that needs an adult's care. */
export const KID_TASKS = [
  'brushTeethMorning', 'brushTeethNight', 'washHands', 'drinkWater', 'eatFruit', 'eatVegetables',
  'playOutside', 'bedOnTime', 'bath', 'tidyToys', 'readBook', 'helpAtHome', 'sunHat', 'mosquitoNet',
] as const;
export type KidTaskKey = (typeof KID_TASKS)[number];

/** A starter set for a new child, so the corner is never empty. */
export const STARTER_TASKS: readonly KidTaskKey[] = ['brushTeethMorning', 'washHands', 'drinkWater', 'bedOnTime'];

/** Kids questions: answer index only; 3 picture options each. */
export const KID_QUIZ: readonly { id: string; answer: number }[] = [
  { id: 'q01', answer: 1 }, { id: 'q02', answer: 0 }, { id: 'q03', answer: 2 }, { id: 'q04', answer: 1 },
  { id: 'q05', answer: 0 }, { id: 'q06', answer: 2 }, { id: 'q07', answer: 1 }, { id: 'q08', answer: 0 },
  { id: 'q09', answer: 2 }, { id: 'q10', answer: 1 }, { id: 'q11', answer: 0 }, { id: 'q12', answer: 2 },
  { id: 'q13', answer: 1 }, { id: 'q14', answer: 0 }, { id: 'q15', answer: 2 }, { id: 'q16', answer: 1 },
  { id: 'q17', answer: 0 }, { id: 'q18', answer: 2 }, { id: 'q19', answer: 1 }, { id: 'q20', answer: 0 },
];

export function kidQuestionForDate(localDate: string): { id: string; answer: number } {
  const day = Math.floor(Date.parse(`${localDate}T12:00:00Z`) / 86_400_000);
  return KID_QUIZ[((day % KID_QUIZ.length) + KID_QUIZ.length) % KID_QUIZ.length];
}

/** Kids corner is for children; older dependants (e.g. a grandparent) don't see it. */
export const KIDS_MAX_AGE = 12;

/**
 * Routine well-child visits by age (WHO / national immunisation programme pattern used in
 * Nigeria, Ghana and Rwanda). We remind parents to go and to bring the child's health card;
 * the clinic decides which vaccines are due.
 */
export const WELL_CHILD_VISITS: readonly { key: string; days: number }[] = [
  { key: 'birth', days: 0 },
  { key: 'week6', days: 42 },
  { key: 'week10', days: 70 },
  { key: 'week14', days: 98 },
  { key: 'month6', days: 183 },
  { key: 'month9', days: 274 },
  { key: 'month12', days: 365 },
  { key: 'month15', days: 456 },
  { key: 'month18', days: 548 },
  { key: 'year2', days: 730 },
  { key: 'year3', days: 1095 },
  { key: 'year4', days: 1461 },
  { key: 'year5', days: 1826 },
];

export function ageInYears(dateOfBirth: string, today: string): number {
  const [y, m, d] = dateOfBirth.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date.slice(0, 10)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The next visit (or one just missed, within 30 days) for a child, or null once they're past 5. */
export function nextWellChildVisit(dateOfBirth: string, today: string): { key: string; dueDate: string; daysAway: number } | null {
  for (const v of WELL_CHILD_VISITS) {
    const dueDate = addDays(dateOfBirth, v.days);
    const daysAway = Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    if (daysAway >= -30) return { key: v.key, dueDate, daysAway };
  }
  return null;
}

/** Stars needed for each kids level; shown as a jar filling up. */
export const STAR_LEVELS = [0, 10, 30, 60, 100, 150, 220, 300] as const;
export function starLevel(stars: number): { level: number; nextAt: number | null } {
  let level = 1;
  STAR_LEVELS.forEach((min, i) => { if (stars >= min) level = i + 1; });
  return { level, nextAt: STAR_LEVELS[level] ?? null };
}
