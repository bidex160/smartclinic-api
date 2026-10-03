import { allQuestions, COMMON, COMPLAINTS, CONDITIONS, Match, RED_FLAGS, Urgency } from './intake.content';

/** Answers keyed by question id: 'YES'/'NO', an option id, or option ids (MANY). `complaints` holds the picked complaint ids. */
export type Answers = Record<string, string | string[]>;

export interface IntakeConsideration {
  code: string;
  name: string;
  score: number;
  /** The answers that point to it, in doctor-facing English. */
  why: string[];
  labs: string[];
  imaging: string[];
  meds: string[];
  note: string;
}

export interface IntakeResult {
  urgency: Urgency;
  redFlags: { id: string; label: string; urgency: 'EMERGENCY' | 'TODAY' }[];
  considerations: IntakeConsideration[];
  summary: string;
}

const MAX_CONSIDERATIONS = 5;
/** Problems that, with no red flag, can wait for a routine visit. */
const ROUTINE_ONLY = new Set(['BP_SUGAR', 'SKIN']);

const QUESTIONS = allQuestions();
const COMPLAINT_IDS = new Set(COMPLAINTS.map((c) => c.id));

function values(a: Answers, q: string): string[] {
  const v = a[q];
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function matches(a: Answers, m: Match): boolean {
  const want = Array.isArray(m.is) ? m.is : [m.is];
  return values(a, m.q).some((v) => want.includes(v));
}

/** Plain English for one matched feature, e.g. "Chills or shivering" or "Fever pattern: comes and goes". */
function describe(m: Match, a: Answers): string {
  if (m.q === 'complaints') {
    const ids = Array.isArray(m.is) ? m.is : [m.is];
    return COMPLAINTS.filter((c) => ids.includes(c.id)).map((c) => c.label).join(' / ');
  }
  const q = QUESTIONS.get(m.q);
  if (!q) return m.q;
  if (q.type === 'YES_NO') return q.label;
  const picked = values(a, m.q).filter((v) => (Array.isArray(m.is) ? m.is : [m.is]).includes(v));
  const labels = picked.map((v) => q.options?.find((o) => o.id === v)?.label ?? v);
  return `${q.label}: ${labels.join(', ')}`;
}

/**
 * Keep only known questions and allowed values, and drop questions that would not have been asked
 * (e.g. pregnancy for a man, a complaint's questions when the complaint was not picked).
 */
export function cleanAnswers(raw: Record<string, unknown>): Answers {
  const out: Answers = {};
  const complaints = (Array.isArray(raw['complaints']) ? raw['complaints'] : []).map(String).filter((c) => COMPLAINT_IDS.has(c));
  out['complaints'] = [...new Set(complaints)].slice(0, 6);
  const put = (id: string) => {
    const q = QUESTIONS.get(id)!;
    const v = raw[id];
    if (v === undefined || v === null || v === '') return;
    if (q.type === 'YES_NO') {
      if (v === 'YES' || v === 'NO' || v === true || v === false) out[id] = v === true || v === 'YES' ? 'YES' : 'NO';
      return;
    }
    const allowed = new Set((q.options ?? []).map((o) => o.id));
    if (q.type === 'ONE') {
      if (typeof v === 'string' && allowed.has(v)) out[id] = v;
      return;
    }
    const list = (Array.isArray(v) ? v : [v]).map(String).filter((x) => allowed.has(x));
    if (list.length) out[id] = [...new Set(list)];
  };
  for (const q of COMMON) put(q.id);
  // Drop questions whose condition fails, in order (common first so sex/age are known).
  const visible = (showIf?: Match) => !showIf || matches(out, showIf);
  for (const q of COMMON) if (!visible(q.showIf)) delete out[q.id];
  for (const c of COMPLAINTS) {
    if (!out['complaints'].includes(c.id)) continue;
    if (!visible(c.showIf)) {
      out['complaints'] = (out['complaints'] as string[]).filter((x) => x !== c.id);
      continue;
    }
    for (const q of c.questions) if (visible(q.showIf)) put(q.id);
  }
  return out;
}

export function evaluate(a: Answers): IntakeResult {
  const flags = RED_FLAGS.filter((f) => f.any.some((m) => matches(a, m)) && (f.and ?? []).every((m) => matches(a, m)))
    .map((f) => ({ id: f.id, label: f.label, urgency: f.urgency }));

  const considerations: IntakeConsideration[] = [];
  for (const c of CONDITIONS) {
    let score = 0;
    const why: string[] = [];
    for (const f of c.features) {
      if (!matches(a, f.when)) continue;
      score += f.weight;
      const d = describe(f.when, a);
      if (d && !why.includes(d)) why.push(d);
    }
    if (score >= c.min) considerations.push({ code: c.code, name: c.name, score, why, labs: c.labs, imaging: c.imaging, meds: c.meds, note: c.note });
  }
  considerations.sort((x, y) => y.score - x.score);
  const top = considerations.slice(0, MAX_CONSIDERATIONS);

  const complaints = values(a, 'complaints');
  let urgency: Urgency;
  if (flags.some((f) => f.urgency === 'EMERGENCY')) urgency = 'EMERGENCY';
  else if (flags.length) urgency = 'TODAY';
  else if (complaints.length && complaints.every((c) => ROUTINE_ONLY.has(c))) urgency = 'ROUTINE';
  else urgency = 'SOON';

  return { urgency, redFlags: flags, considerations: top, summary: summarise(a, flags, top) };
}

/** A few lines a doctor can read in ten seconds. */
export function summarise(a: Answers, flags: IntakeResult['redFlags'], top: IntakeConsideration[]): string {
  const label = (id: string) => {
    const q = QUESTIONS.get(id);
    const v = values(a, id);
    if (!q || !v.length) return null;
    return v.map((x) => q.options?.find((o) => o.id === x)?.label ?? x).join(', ');
  };
  const who = [label('age') ? `Age ${label('age')}` : null, label('sex'), label('who') && values(a, 'who')[0] !== 'ME' ? `answered for ${label('who')}` : null].filter(Boolean).join(', ');
  const lines: string[] = [];
  const complaints = COMPLAINTS.filter((c) => values(a, 'complaints').includes(c.id));
  lines.push(`${complaints.map((c) => c.label).join('; ') || 'No complaint picked'}${label('days') ? ` — ${label('days')}` : ''}.${who ? ` ${who}.` : ''}`);
  for (const c of complaints) {
    const pos: string[] = [];
    const neg: string[] = [];
    for (const q of c.questions) {
      const v = values(a, q.id);
      if (!v.length) continue;
      if (q.type === 'YES_NO') (v[0] === 'YES' ? pos : neg).push(q.label.toLowerCase());
      else pos.push(`${q.label.toLowerCase()}: ${label(q.id)}`);
    }
    const parts = [pos.length ? pos.join('; ') : null, neg.length ? `no ${neg.join(', no ')}` : null].filter(Boolean);
    if (parts.length) lines.push(`${c.label}: ${parts.join('. ')}.`);
  }
  if (values(a, 'kid.danger')[0] === 'YES') lines.push('Child danger sign reported.');
  if (flags.length) lines.push(`Red flags: ${flags.map((f) => f.label).join('; ')}.`);
  if (top.length) lines.push(`To consider: ${top.map((c) => c.name).join(', ')}.`);
  return lines.join('\n');
}

/** The questions to show, without the doctor-only parts (weights, conditions). */
export function questionnaire() {
  const strip = (q: (typeof COMMON)[number]) => ({ id: q.id, type: q.type, options: q.options?.map((o) => o.id), showIf: q.showIf });
  return {
    common: COMMON.map(strip),
    complaints: COMPLAINTS.map((c) => ({ id: c.id, emoji: c.emoji, showIf: c.showIf, questions: c.questions.map(strip) })),
  };
}
