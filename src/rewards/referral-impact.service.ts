import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { PublicReferralLeaderboardDto, ReferralImpactDto } from './dto/referral.dto';
import { ReferralsService } from './referrals.service';

const PUBLIC_LEADERBOARD_LIMIT = 20;

type RankedRow = {
  userId: string;
  displayName: string | null;
  points: string;
  referrals: string;
  city: string | null;
  country: string | null;
  level: string | null;
};

export function safePublicName(displayName: string | null): string {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SmartClinic Member';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts.at(-1)![0].toUpperCase()}.`;
}

@Injectable()
export class ReferralImpactService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly referrals: ReferralsService,
  ) {}

  async leaderboard(): Promise<PublicReferralLeaderboardDto> {
    const [peopleRows, cityRows, countryRows] = await Promise.all([
      this.dataSource.query<RankedRow[]>(`${this.rankedMembersSql()}
        SELECT "userId", "displayName", points, referrals, city, country, level
        FROM ranked
        ORDER BY points DESC, referrals DESC, "userId" ASC
        LIMIT $1`, [PUBLIC_LEADERBOARD_LIMIT]),
      this.dataSource.query<{ name: string; points: string }[]>(`${this.rankedMembersSql()}
        SELECT MIN(city) AS name, SUM(points)::bigint AS points
        FROM ranked WHERE city IS NOT NULL
        GROUP BY LOWER(city)
        ORDER BY points DESC, LOWER(MIN(city)) ASC
        LIMIT $1`, [PUBLIC_LEADERBOARD_LIMIT]),
      this.dataSource.query<{ name: string; points: string }[]>(`${this.rankedMembersSql()}
        SELECT MIN(country) AS name, SUM(points)::bigint AS points
        FROM ranked WHERE country IS NOT NULL
        GROUP BY UPPER(country)
        ORDER BY points DESC, UPPER(MIN(country)) ASC
        LIMIT $1`, [PUBLIC_LEADERBOARD_LIMIT]),
    ]);
    return {
      people: peopleRows.map((row) => ({
        name: safePublicName(row.displayName),
        points: Number(row.points),
        city: row.city,
        country: row.country,
        level: row.level,
        referrals: Number(row.referrals),
      })),
      cities: cityRows.map((row) => ({ name: row.name, points: Number(row.points) })),
      countries: countryRows.map((row) => ({ name: row.name, points: Number(row.points) })),
    };
  }

  async updatePreference(userId: string, publicLeaderboard: boolean) {
    const result = await this.users.update({ id: userId }, { publicLeaderboard });
    if (!result.affected) throw new NotFoundException('User was not found');
    return { publicLeaderboard };
  }

  async impact(userId: string): Promise<ReferralImpactDto> {
    const [summary, user] = await Promise.all([
      this.referrals.summary(userId),
      this.users.findOne({ where: { id: userId }, select: { id: true, publicLeaderboard: true } }),
    ]);
    if (!user) throw new NotFoundException('User was not found');
    const position = user.publicLeaderboard ? await this.position(userId) : null;
    return {
      referralCode: summary.referralCode,
      balances: {
        availablePoints: summary.availablePoints,
        reservedPoints: summary.reservedPoints,
        lifetimeEarnedPoints: summary.lifetimeEarnedPoints,
        lifetimeRedeemedPoints: summary.lifetimeRedeemedPoints,
      },
      levelProgress: summary.levelProgress,
      qualifiedCounts: summary.levelProgress.qualifiedCounts,
      summary: {
        registeredReferrals: summary.registeredDirectReferrals,
        qualifiedReferrals: summary.qualifiedDirectReferrals,
        pendingReferrals: summary.pendingDirectReferrals,
      },
      inviteLinks: summary.links,
      leaderboard: { optedIn: user.publicLeaderboard, position },
    };
  }

  private async position(userId: string): Promise<number | null> {
    const rows = await this.dataSource.query<{ position: string }[]>(`${this.rankedMembersSql()}
      SELECT position::text AS position FROM (
        SELECT "userId", ROW_NUMBER() OVER (ORDER BY points DESC, referrals DESC, "userId" ASC) AS position
        FROM ranked
      ) positions WHERE "userId" = $1`, [userId]);
    return rows[0] ? Number(rows[0].position) : null;
  }

  private rankedMembersSql(): string {
    return `WITH earned AS (
      SELECT user_id, COALESCE(SUM(points), 0)::bigint AS points
      FROM reward_points_ledger WHERE direction = 'CREDIT' GROUP BY user_id
    ), qualified AS (
      SELECT referrer_user_id AS user_id, COUNT(*)::bigint AS referrals
      FROM referrals WHERE status = 'QUALIFIED' GROUP BY referrer_user_id
    ), ranked AS (
      SELECT u.id AS "userId", u.display_name AS "displayName",
        COALESCE(e.points, 0)::bigint AS points,
        COALESCE(q.referrals, 0)::bigint AS referrals,
        NULLIF(TRIM(p.city), '') AS city,
        NULLIF(UPPER(TRIM(p.country_code)), '') AS country,
        achieved.name AS level
      FROM users u
      LEFT JOIN earned e ON e.user_id = u.id
      LEFT JOIN qualified q ON q.user_id = u.id
      LEFT JOIN providers p ON p.user_id = u.id AND p.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT definition.name
        FROM reward_level_achievements achievement
        INNER JOIN reward_level_definitions definition ON definition.id = achievement.level_id AND definition.is_active = true
        WHERE achievement.user_id = u.id
        ORDER BY definition.ordinal DESC LIMIT 1
      ) achieved ON true
      WHERE u.public_leaderboard = true AND u.deleted_at IS NULL AND u.status = 'ACTIVE'
    )`;
  }
}
