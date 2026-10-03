import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { HealthQuizAnswer } from '../health-passport/engagement/health-quiz-answer.entity';
import { PatientDailyCheckIn } from '../patients/entities/patient-daily-check-in.entity';
import { PatientDailyRoutineCompletion } from '../patients/entities/patient-daily-routine-completion.entity';
import { DayActivity, EMPTY_DAY } from './challenge-scoring';
import { HealthWordGame } from './play.entities';

const day = (d: string | Date) => String(d instanceof Date ? d.toISOString() : d).slice(0, 10);

/** Loads what a group of people did, day by day, in four queries. */
@Injectable()
export class PlayActivityService {
  constructor(
    @InjectRepository(PatientDailyCheckIn) private readonly checkIns: Repository<PatientDailyCheckIn>,
    @InjectRepository(PatientDailyRoutineCompletion) private readonly ticks: Repository<PatientDailyRoutineCompletion>,
    @InjectRepository(HealthQuizAnswer) private readonly quiz: Repository<HealthQuizAnswer>,
    @InjectRepository(HealthWordGame) private readonly words: Repository<HealthWordGame>,
  ) {}

  async byPatient(patientIds: readonly string[], from: string, to: string): Promise<Map<string, Map<string, DayActivity>>> {
    const out = new Map<string, Map<string, DayActivity>>();
    if (!patientIds.length) return out;
    const ids = In([...new Set(patientIds)]);
    const range = Between(from, to);
    const [checkIns, ticks, quiz, words] = await Promise.all([
      this.checkIns.find({ where: { patientId: ids, localDate: range }, select: { patientId: true, localDate: true } }),
      this.ticks.find({ where: { patientId: ids, localDate: range }, select: { patientId: true, localDate: true } }),
      this.quiz.find({ where: { patientId: ids, localDate: range }, select: { patientId: true, localDate: true, correct: true } }),
      this.words.find({ where: { patientId: ids, localDate: range, finished: true } }),
    ]);
    const get = (patientId: string, date: string | Date): DayActivity => {
      let days = out.get(patientId);
      if (!days) out.set(patientId, (days = new Map()));
      const key = day(date);
      let d = days.get(key);
      if (!d) days.set(key, (d = { ...EMPTY_DAY }));
      return d;
    };
    for (const c of checkIns) get(c.patientId, c.localDate).checkIn = true;
    for (const t of ticks) get(t.patientId, t.localDate).routine = true;
    for (const q of quiz) {
      const d = get(q.patientId, q.localDate);
      d.quizAnswered = true;
      d.quizCorrect = q.correct;
    }
    for (const w of words) {
      const d = get(w.patientId, w.localDate);
      d.wordFinished = true;
      d.wordSolved = w.solved;
      d.wordGuesses = w.guesses.length;
      d.wordSeconds = w.finishedAt ? Math.max(0, Math.round((w.finishedAt.getTime() - w.startedAt.getTime()) / 1000)) : null;
    }
    return out;
  }
}
