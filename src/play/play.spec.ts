import { chooseNudge, nudgeText } from '../family/nudges.content';
import { summarise } from '../health-passport/engagement/engagement.service';
import { addDays, datesBetween, DayActivity, dayScore, EMPTY_DAY, publicName, standings, weekStart } from './challenge-scoring';
import { HEALTH_WORDS, markGuess, normaliseGuess, puzzleNumber, WORD_LENGTH, wordFact, wordForDate } from './health-word.content';
import { PLAY_TEXT } from './i18n';
import { en } from './i18n/en';
import { ChallengeTheme } from './play.entities';

const day = (p: Partial<DayActivity>): DayActivity => ({ ...EMPTY_DAY, ...p });

describe('Health Word', () => {
  it('has valid, unique five-letter words with stable ids', () => {
    expect(HEALTH_WORDS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(HEALTH_WORDS.map((w) => w.word)).size).toBe(HEALTH_WORDS.length);
    expect(new Set(HEALTH_WORDS.map((w) => w.id)).size).toBe(HEALTH_WORDS.length);
    for (const w of HEALTH_WORDS) expect(w.word).toMatch(new RegExp(`^[A-Z]{${WORD_LENGTH}}$`));
  });

  it('every word has a fact in every language, with no answer spelled out in English', () => {
    for (const [lang, text] of Object.entries(PLAY_TEXT)) {
      for (const w of HEALTH_WORDS) {
        expect([lang, w.id, Boolean(text.facts[w.id]?.trim())]).toEqual([lang, w.id, true]);
      }
    }
    expect(Object.keys(en.facts).sort()).toEqual(HEALTH_WORDS.map((w) => w.id).sort());
    expect(wordFact('xx', 'w01')).toBe(en.facts.w01);
  });

  it('keeps message placeholders in every language', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [lang, text] of Object.entries(PLAY_TEXT)) {
      for (const [key, m] of Object.entries(en.messages)) {
        const t = text.messages[key as keyof typeof en.messages];
        expect([lang, key, holes(t.title), holes(t.body)]).toEqual([lang, key, holes(m.title), holes(m.body)]);
      }
    }
  });

  it('gives everyone the same word on the same date and numbers puzzles from 1 October 2026', () => {
    expect(puzzleNumber('2026-10-01')).toBe(1);
    expect(puzzleNumber('2026-10-03')).toBe(3);
    expect(wordForDate('2026-10-01').word).toBe('HEART');
    expect(wordForDate('2026-10-02').id).toBe('w02');
    expect(wordForDate(addDays('2026-10-01', HEALTH_WORDS.length)).id).toBe('w01');
    expect(wordForDate('2026-09-30').id).toBe(HEALTH_WORDS[HEALTH_WORDS.length - 1].id);
  });

  it('marks letters fairly, including repeated letters', () => {
    expect(markGuess('HEART', 'HEART')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
    expect(markGuess('EARTH', 'HEART')).toEqual(['near', 'near', 'near', 'near', 'near']);
    // TEETH vs SLEEP: one E is in place, the second E is used up by SLEEP's other E, T and H are not there.
    expect(markGuess('TEETH', 'SLEEP')).toEqual(['miss', 'near', 'hit', 'miss', 'miss']);
    // PULSE has one L, so only the first L is marked.
    expect(markGuess('LLAMA', 'PULSE')).toEqual(['near', 'miss', 'miss', 'miss', 'miss']);
  });

  it('accepts five letters only', () => {
    expect(normaliseGuess(' heart ')).toBe('HEART');
    expect(normaliseGuess('hear')).toBeNull();
    expect(normaliseGuess('he4rt')).toBeNull();
    expect(normaliseGuess('héart')).toBeNull();
  });
});

describe('Challenge scoring', () => {
  it('scores healthy actions per day with a cap', () => {
    const all = day({ checkIn: true, routine: true, quizAnswered: true, quizCorrect: true, wordFinished: true, wordSolved: true, wordGuesses: 1 });
    expect(dayScore(ChallengeTheme.ALL_ROUND, all)).toBe(30);
    expect(dayScore(ChallengeTheme.WORD, all)).toBe(20);
    expect(dayScore(ChallengeTheme.WORD, day({ wordFinished: true, wordSolved: true, wordGuesses: 6 }))).toBe(10);
    expect(dayScore(ChallengeTheme.WORD, day({ wordFinished: true, wordGuesses: 6 }))).toBe(2);
    expect(dayScore(ChallengeTheme.QUIZ, day({ quizAnswered: true }))).toBe(5);
    expect(dayScore(ChallengeTheme.ACTIVE_DAYS, all)).toBe(10);
    expect(dayScore(ChallengeTheme.ALL_ROUND, EMPTY_DAY)).toBe(0);
  });

  it('ranks best first, ties share a place, and splits word ties by time', () => {
    const dates = ['2026-10-01', '2026-10-02'];
    const a = new Map([['2026-10-01', day({ checkIn: true })]]);
    const b = new Map([['2026-10-02', day({ routine: true })]]);
    const c = new Map([['2026-10-01', day({ checkIn: true, quizAnswered: true })]]);
    const rows = standings(ChallengeTheme.ALL_ROUND, [{ key: 'a', days: a }, { key: 'b', days: b }, { key: 'c', days: c }], dates, '2026-10-02');
    expect(rows.map((r) => [r.key, r.score, r.rank])).toEqual([['c', 15, 1], ['a', 10, 2], ['b', 10, 2]]);
    expect(rows.find((r) => r.key === 'b')!.doneToday).toBe(true);

    const fast = new Map([['2026-10-01', day({ wordFinished: true, wordSolved: true, wordGuesses: 3, wordSeconds: 40 })]]);
    const slow = new Map([['2026-10-01', day({ wordFinished: true, wordSolved: true, wordGuesses: 3, wordSeconds: 90 })]]);
    const w = standings(ChallengeTheme.WORD, [{ key: 'slow', days: slow }, { key: 'fast', days: fast }], dates, '2026-10-02');
    expect(w.map((r) => [r.key, r.rank])).toEqual([['fast', 1], ['slow', 2]]);
  });

  it('handles dates and names', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(weekStart('2026-10-03')).toBe('2026-09-28');
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
    expect(weekStart('2026-10-04')).toBe('2026-09-28');
    expect(publicName('Adaeze Grace', 'Okafor')).toBe('Adaeze O.');
    expect(publicName('Bola', '')).toBe('Bola');
    expect(publicName(null, null)).toBe('Friend');
  });
});

describe('Points and badges from Play', () => {
  const base = {
    dateOfBirth: false, phone: false, bloodGroup: false, genotype: false, allergiesRecorded: false, emergencyContact: false,
    routines: 0, dependants: 0, selfChecks: 0, healthChecks: 0, checkInDates: [], routineDates: [], quizAnswers: 0, quizCorrect: 0,
  };
  it('adds 5 per finished Health Word and 5 more per solve, and awards the new badges', () => {
    const s = summarise({ ...base, wordPlayed: 3, wordSolved: 2, challengesJoined: 1 }, '2026-10-03');
    expect(s.points).toBe(25);
    expect(s.badges.find((b) => b.code === 'WORD_FINDER')!.earned).toBe(true);
    expect(s.badges.find((b) => b.code === 'WORD_WIZARD')).toMatchObject({ earned: false, progress: { current: 2, target: 10 } });
    expect(s.badges.find((b) => b.code === 'CHALLENGER')!.earned).toBe(true);
  });
  it('still works for callers without Play counts', () => {
    expect(summarise(base, '2026-10-03').points).toBe(0);
  });
});

describe('Nudges about Play', () => {
  const facts = { activeToday: false, streak: 0, quizAnsweredToday: false, passportIncomplete: false, kidsPending: [], ignoredInARow: 0, dayNumber: 20000 };
  it('a running challenge comes before the streak, and says if you lead', () => {
    const c = chooseNudge({ ...facts, streak: 5, challenge: { rank: 2, total: 4, daysLeft: 3, code: 'ABCDEFGH' } });
    expect(c).toEqual({ kind: 'challenge', params: { rank: 2, total: 4, days: 3 }, route: '/me/play/challenges/ABCDEFGH' });
    expect(nudgeText('en', c!.kind, c!.params).title).toBe('You are #2 in your health challenge');
    expect(chooseNudge({ ...facts, challenge: { rank: 1, total: 2, daysLeft: 1, code: 'ABCDEFGH' } })!.kind).toBe('challengeLead');
  });
  it('alternates the daily question and the Health Word', () => {
    expect(chooseNudge({ ...facts, dayNumber: 20000 })!.kind).toBe('quiz');
    expect(chooseNudge({ ...facts, dayNumber: 20001 })).toMatchObject({ kind: 'word', route: '/me/play' });
    expect(chooseNudge({ ...facts, dayNumber: 20000, quizAnsweredToday: true })!.kind).toBe('word');
    expect(chooseNudge({ ...facts, dayNumber: 20001, wordPlayedToday: true })!.kind).toBe('quiz');
  });
  it('stays quiet once you have been active today', () => {
    expect(chooseNudge({ ...facts, activeToday: true, challenge: { rank: 3, total: 3, daysLeft: 2, code: 'ABCDEFGH' } })).toBeNull();
  });
});
