import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { User } from '../users/entities/user.entity';

/** One Health Word game per patient per local day. */
@Entity('health_word_games')
@Index('UQ_health_word_game_patient_date', ['patientId', 'localDate'], { unique: true })
export class HealthWordGame {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @Column({ name: 'local_date', type: 'date' }) localDate!: string;
  @Column({ name: 'puzzle_number', type: 'integer' }) puzzleNumber!: number;
  @Column({ name: 'word_id', type: 'varchar', length: 10 }) wordId!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) guesses!: string[];
  @Column({ type: 'boolean', default: false }) solved!: boolean;
  @Column({ type: 'boolean', default: false }) finished!: boolean;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt!: Date | null;
}

export enum ChallengeTheme {
  ALL_ROUND = 'ALL_ROUND',
  WORD = 'WORD',
  QUIZ = 'QUIZ',
  ACTIVE_DAYS = 'ACTIVE_DAYS',
}

export enum ChallengeMode {
  DUEL = 'DUEL',
  GROUP = 'GROUP',
}

/** A friendly contest on healthy actions over a few days. Never scored on health results. */
@Entity('health_challenges')
export class HealthChallenge {
  @PrimaryGeneratedColumn('uuid') id!: string;
  /** Short code used in invite links. */
  @Column({ type: 'varchar', length: 12, unique: true }) code!: string;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'created_by_user_id' }) createdBy!: User;
  @Column({ type: 'varchar', length: 20 }) theme!: ChallengeTheme;
  @Column({ type: 'varchar', length: 10 }) mode!: ChallengeMode;
  @Column({ name: 'start_date', type: 'date' }) startDate!: string;
  @Column({ name: 'end_date', type: 'date' }) endDate!: string;
  @Column({ type: 'varchar', length: 64, default: 'Africa/Lagos' }) timezone!: string;
  @Column({ name: 'max_participants', type: 'integer' }) maxParticipants!: number;
  /** Set once the results have been sent, so they go out once. */
  @Column({ name: 'results_sent_at', type: 'timestamptz', nullable: true }) resultsSentAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

@Entity('health_challenge_participants')
@Index('UQ_health_challenge_participant', ['challengeId', 'userId'], { unique: true })
@Index('IDX_health_challenge_participant_user', ['userId'])
export class HealthChallengeParticipant {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'challenge_id', type: 'uuid' }) challengeId!: string;
  @ManyToOne(() => HealthChallenge, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'challenge_id' }) challenge!: HealthChallenge;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' }) joinedAt!: Date;
}
