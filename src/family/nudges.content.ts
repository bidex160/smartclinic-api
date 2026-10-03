/**
 * Once-a-day nudges. Short, kind, never alarming, never medical advice.
 * yo, ha, ig, rw and tw are drafts for native-speaker review (see the translation review sheet).
 */
import { playText } from '../play/i18n';

type BaseKind = 'quiz' | 'streak' | 'kids' | 'passport' | 'welcomeBack' | 'visitSoon' | 'visitToday';
/** Nudges about Play live with the Play text (see src/play/i18n). */
const PLAY_KINDS = { challenge: 'challengeNudge', challengeLead: 'challengeLead', word: 'wordNudge' } as const;
export type NudgeKind = BaseKind | keyof typeof PLAY_KINDS;
export type NudgeLanguage = 'en' | 'pcm' | 'yo' | 'ha' | 'ig' | 'rw' | 'fr' | 'sw' | 'tw';

type Text = { title: string; body: string };

export const NUDGES: Readonly<Record<NudgeLanguage, Readonly<Record<BaseKind, Text>>>> = {
  en: {
    quiz: { title: 'Your health question is ready', body: 'One quick question a day. Answer today’s for up to 10 points.' },
    streak: { title: 'Keep your {n}-day streak going', body: 'Do one small thing today: your check-in or today’s question.' },
    kids: { title: '{child}’s stars are waiting ⭐', body: '{done} of {total} tasks done today. Tap to cheer them on.' },
    passport: { title: 'One step for your Health Passport', body: 'Add one detail today. It takes a minute and could help in an emergency.' },
    welcomeBack: { title: 'We kept your place', body: 'Your points are safe. Come back for today’s question.' },
    visitSoon: { title: '{child}’s check-up is coming up', body: 'Due around {date}. Take their health card. Tap to plan it.' },
    visitToday: { title: '{child}’s check-up is due today', body: 'Take their health card to the clinic. Tap to plan it.' },
  },
  pcm: {
    quiz: { title: 'Your health question don ready', body: 'One small question every day. Answer today own make you get up to 10 points.' },
    streak: { title: 'No let your {n}-day streak break', body: 'Do one small thing today: your check-in or today question.' },
    kids: { title: '{child} stars dey wait ⭐', body: '{done} out of {total} tasks don finish today. Tap make you hail am.' },
    passport: { title: 'One step for your Health Passport', body: 'Add one thing today. E no go pass one minute, and e fit help for emergency.' },
    welcomeBack: { title: 'We keep your place for you', body: 'Your points dey safe. Come back for today question.' },
    visitSoon: { title: '{child} check-up dey come', body: 'E go reach around {date}. Carry im health card. Tap make you plan am.' },
    visitToday: { title: '{child} check-up na today', body: 'Carry im health card go clinic. Tap make you plan am.' },
  },
  yo: {
    quiz: { title: 'Ìbéèrè ìlera yín ti ṣetán', body: 'Ìbéèrè kékeré kan lójoojúmọ́. Ẹ dáhùn tòní láti gba tó àmì 10.' },
    streak: { title: 'Ẹ má jẹ́ kí ọjọ́ {n} léraléra yín já', body: 'Ẹ ṣe ohun kékeré kan lónìí: sísọ bí ara yín ṣe rí tàbí ìbéèrè tòní.' },
    kids: { title: 'Ìràwọ̀ {child} ń dúró ⭐', body: 'Iṣẹ́ {done} nínú {total} ti parí lónìí. Ẹ tẹ̀ láti gbà á níyànjú.' },
    passport: { title: 'Ìgbésẹ̀ kan fún Health Passport yín', body: 'Ẹ fi àlàyé kan kún un lónìí. Ìṣẹ́jú kan péré ni, ó sì lè ṣèrànwọ́ nígbà pàjáwìrì.' },
    welcomeBack: { title: 'A pa àyè yín mọ́', body: 'Àmì yín wà láìléwu. Ẹ padà wá fún ìbéèrè tòní.' },
    visitSoon: { title: 'Àyẹ̀wò {child} ń bọ̀', body: 'Ó yẹ ní nǹkan bí {date}. Ẹ mú káàdì ìlera rẹ̀ dání. Ẹ tẹ̀ láti ṣètò rẹ̀.' },
    visitToday: { title: 'Àyẹ̀wò {child} jẹ́ lónìí', body: 'Ẹ mú káàdì ìlera rẹ̀ lọ sí ilé-ìwòsàn. Ẹ tẹ̀ láti ṣètò rẹ̀.' },
  },
  ha: {
    quiz: { title: 'Tambayar lafiyarka ta shirya', body: 'Ƙaramar tambaya ɗaya a kowace rana. Amsa ta yau don samun maki har 10.' },
    streak: { title: 'Ci gaba da jerin kwanaki {n}', body: 'Yi ƙaramin abu ɗaya yau: duba yadda kake ko tambayar yau.' },
    kids: { title: 'Taurarin {child} suna jira ⭐', body: 'An gama ayyuka {done} cikin {total} yau. Danna don ƙarfafa su.' },
    passport: { title: 'Mataki ɗaya don Health Passport ɗinka', body: 'Ƙara bayani ɗaya yau. Minti ɗaya ne kawai, kuma zai iya taimakawa a lokacin gaggawa.' },
    welcomeBack: { title: 'Mun ajiye maka wurinka', body: 'Makinka suna nan lafiya. Dawo don tambayar yau.' },
    visitSoon: { title: 'Duba lafiyar {child} na zuwa', body: 'Zai kai kusan {date}. Ɗauki katin lafiyarsu. Danna don shiryawa.' },
    visitToday: { title: 'Duba lafiyar {child} yau ne', body: 'Ɗauki katin lafiyarsu zuwa asibiti. Danna don shiryawa.' },
  },
  ig: {
    quiz: { title: 'Ajụjụ ahụike gị dị njikere', body: 'Otu obere ajụjụ kwa ụbọchị. Zaa nke taa ka ị nweta ihe ruru akara 10.' },
    streak: { title: 'Gaa n’ihu n’usoro ụbọchị {n} gị', body: 'Mee otu obere ihe taa: nlele gị ma ọ bụ ajụjụ taa.' },
    kids: { title: 'Kpakpando {child} na-eche ⭐', body: 'Emechaala ọrụ {done} n’ime {total} taa. Pịa ka ị kwado ha.' },
    passport: { title: 'Otu nzọụkwụ maka Health Passport gị', body: 'Tinye otu nkọwa taa. Ọ na-ewe naanị otu nkeji, ọ nwekwara ike inye aka n’oge mberede.' },
    welcomeBack: { title: 'Anyị debere ọnọdụ gị', body: 'Anyị chekwara akara gị. Lọghachi maka ajụjụ taa.' },
    visitSoon: { title: 'Nlele ahụike {child} na-abịa', body: 'Ọ ga-eru ihe dị ka {date}. Bute kaadị ahụike ha. Pịa ka ị hazie ya.' },
    visitToday: { title: 'Nlele ahụike {child} bụ taa', body: 'Bute kaadị ahụike ha gaa ụlọ ọgwụ. Pịa ka ị hazie ya.' },
  },
  rw: {
    quiz: { title: 'Ikibazo cyawe cy’ubuzima kiriteguye', body: 'Ikibazo kimwe gito buri munsi. Subiza icy’uyu munsi ubone amanota agera ku 10.' },
    streak: { title: 'Komeza iminsi {n} ikurikiranye', body: 'Kora ikintu kimwe gito uyu munsi: isuzuma ryawe cyangwa ikibazo cy’uyu munsi.' },
    kids: { title: 'Inyenyeri za {child} zirategereje ⭐', body: 'Imirimo {done} kuri {total} yarangiye uyu munsi. Kanda umutere imbaraga.' },
    passport: { title: 'Intambwe imwe ku Health Passport yawe', body: 'Ongeramo amakuru amwe uyu munsi. Bitwara umunota umwe kandi bishobora gufasha mu bihe byihutirwa.' },
    welcomeBack: { title: 'Twakubikiye umwanya wawe', body: 'Amanota yawe arinzwe. Garuka ku kibazo cy’uyu munsi.' },
    visitSoon: { title: 'Isuzuma rya {child} riregereje', body: 'Rizaba hafi ya {date}. Jyana ikarita ye y’ubuzima. Kanda uritegure.' },
    visitToday: { title: 'Isuzuma rya {child} ni uyu munsi', body: 'Jyana ikarita ye y’ubuzima ku ivuriro. Kanda uritegure.' },
  },
  fr: {
    quiz: { title: 'Votre question santé est prête', body: 'Une petite question par jour. Répondez à celle d’aujourd’hui pour gagner jusqu’à 10 points.' },
    streak: { title: 'Gardez votre série de {n} jours', body: 'Faites une petite chose aujourd’hui : votre suivi du jour ou la question du jour.' },
    kids: { title: 'Les étoiles de {child} l’attendent ⭐', body: '{done} tâches sur {total} faites aujourd’hui. Touchez pour l’encourager.' },
    passport: { title: 'Une étape pour votre Health Passport', body: 'Ajoutez une information aujourd’hui. Cela prend une minute et peut aider en cas d’urgence.' },
    welcomeBack: { title: 'Nous avons gardé votre place', body: 'Vos points sont en sécurité. Revenez pour la question du jour.' },
    visitSoon: { title: 'Le contrôle de {child} approche', body: 'Prévu vers le {date}. Prenez son carnet de santé. Touchez pour le planifier.' },
    visitToday: { title: 'Le contrôle de {child} est aujourd’hui', body: 'Emmenez son carnet de santé au centre de santé. Touchez pour le planifier.' },
  },
  sw: {
    quiz: { title: 'Swali lako la afya liko tayari', body: 'Swali moja dogo kila siku. Jibu la leo upate hadi pointi 10.' },
    streak: { title: 'Endeleza mfululizo wako wa siku {n}', body: 'Fanya jambo moja dogo leo: tathmini yako ya leo au swali la leo.' },
    kids: { title: 'Nyota za {child} zinasubiri ⭐', body: 'Kazi {done} kati ya {total} zimekamilika leo. Gusa umtie moyo.' },
    passport: { title: 'Hatua moja kwa Health Passport yako', body: 'Ongeza taarifa moja leo. Inachukua dakika moja na inaweza kusaidia wakati wa dharura.' },
    welcomeBack: { title: 'Tumekuwekea nafasi yako', body: 'Pointi zako ziko salama. Rudi kwa swali la leo.' },
    visitSoon: { title: 'Uchunguzi wa {child} unakaribia', body: 'Unatarajiwa karibu {date}. Beba kadi yake ya afya. Gusa kupanga.' },
    visitToday: { title: 'Uchunguzi wa {child} ni leo', body: 'Peleka kadi yake ya afya kliniki. Gusa kupanga.' },
  },
  tw: {
    quiz: { title: 'Wo apɔmuden asɛmmisa no asiesie', body: 'Asɛmmisa ketewa baako da biara. Bua nnɛ deɛ na nya points kɔsi 10.' },
    streak: { title: 'Kɔ so wɔ wo nnafua {n} a ɛtoatoa so no mu', body: 'Yɛ ade ketewa baako nnɛ: wo da biara nhwehwɛmu anaa nnɛ asɛmmisa no.' },
    kids: { title: '{child} nsoromma retwɛn ⭐', body: 'Wɔawie adwuma {done} wɔ {total} mu nnɛ. Mia so na hyɛ no nkuran.' },
    passport: { title: 'Anammɔn baako ma wo Health Passport', body: 'Fa nsɛm baako ka ho nnɛ. Ɛgye simma baako pɛ, na ɛbɛtumi aboa wɔ ntɛmntɛm mmerɛ mu.' },
    welcomeBack: { title: 'Yɛakora wo baabi ama wo', body: 'Wo points wɔ hɔ dwoodwoo. San bra ma nnɛ asɛmmisa no.' },
    visitSoon: { title: '{child} apɔmuden nhwehwɛmu reba', body: 'Ɛbɛduru bɛyɛ {date}. Fa ne apɔmuden kaad ka wo ho. Mia so na hyehyɛ.' },
    visitToday: { title: '{child} apɔmuden nhwehwɛmu yɛ nnɛ', body: 'Fa ne apɔmuden kaad kɔ ayaresabea. Mia so na hyehyɛ.' },
  },
};

export function nudgeText(language: string, kind: NudgeKind, params: Record<string, string | number>): Text {
  const lang = (language in NUDGES ? language : 'en') as NudgeLanguage;
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (w, k: string) => (params[k] === undefined ? w : String(params[k])));
  const t = kind in PLAY_KINDS ? playText(lang).messages[PLAY_KINDS[kind as keyof typeof PLAY_KINDS]] : NUDGES[lang][kind as BaseKind];
  return { title: fill(t.title), body: fill(t.body) };
}

export interface NudgeFacts {
  activeToday: boolean;
  streak: number;
  quizAnsweredToday: boolean;
  /** Finished today's Health Word. */
  wordPlayedToday?: boolean;
  /** A running challenge with others where I haven't scored today. */
  challenge?: { rank: number; total: number; daysLeft: number; code: string } | null;
  passportIncomplete: boolean;
  /** Children with tasks left today. */
  kidsPending: { name: string; done: number; total: number; ref: string }[];
  ignoredInARow: number;
  /** Days since 1970, for spacing out nudges when ignored. */
  dayNumber: number;
}

export interface NudgeChoice {
  kind: NudgeKind;
  params: Record<string, string | number>;
  /** Where tapping the nudge goes. */
  route: string;
}

/**
 * The one nudge to send today, or null. Rules:
 * - Already active today and no child waiting: say nothing.
 * - Ignored a week in a row: every 3rd day. Three weeks: once a week. Never nag.
 * - Most useful first: a child waiting, a friend challenge, a streak at risk, a welcome back,
 *   today's question or Health Word (alternating days), the passport.
 */
export function chooseNudge(f: NudgeFacts): NudgeChoice | null {
  const kid = f.kidsPending.find((k) => k.done < k.total);
  if (f.activeToday && !kid) return null;
  if (f.ignoredInARow >= 21 && f.dayNumber % 7 !== 0) return null;
  if (f.ignoredInARow >= 7 && f.ignoredInARow < 21 && f.dayNumber % 3 !== 0) return null;
  if (kid) return { kind: 'kids', params: { child: kid.name, done: kid.done, total: kid.total }, route: `/me/family/kids/${kid.ref}` };
  if (f.challenge) {
    const c = f.challenge;
    return { kind: c.rank === 1 ? 'challengeLead' : 'challenge', params: { rank: c.rank, total: c.total, days: c.daysLeft }, route: `/me/play/challenges/${c.code}` };
  }
  if (f.streak >= 2) return { kind: 'streak', params: { n: f.streak }, route: '/me/progress' };
  if (f.ignoredInARow >= 3) return { kind: 'welcomeBack', params: {}, route: '/me/progress' };
  const wordFirst = f.dayNumber % 2 === 1;
  if (wordFirst && !f.wordPlayedToday) return { kind: 'word', params: {}, route: '/me/play' };
  if (!f.quizAnsweredToday) return { kind: 'quiz', params: {}, route: '/me/progress' };
  if (!f.wordPlayedToday) return { kind: 'word', params: {}, route: '/me/play' };
  if (f.passportIncomplete) return { kind: 'passport', params: {}, route: '/me/health-passport' };
  return null;
}
