import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUserSearchItemDto, AdminUserSearchQueryDto, AdminUserSearchResponseDto } from './dto/admin-user-search.dto';
import { User } from './entities/user.entity';

@Injectable()
export class AdminUserSearchService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async search(query: AdminUserSearchQueryDto): Promise<AdminUserSearchResponseDto> {
    const normalized = query.q.trim().toLowerCase();
    const contains = `%${normalized}%`; const prefix = `${normalized}%`;
    const builder = this.users.createQueryBuilder('user').withDeleted().leftJoinAndSelect('user.provider', 'provider')
      .where('user.deletedAt IS NULL')
      .andWhere('(user.emailNormalized ILIKE :contains OR user.displayName ILIKE :contains)', { contains })
      .orderBy('CASE WHEN user.emailNormalized = :exact THEN 0 WHEN user.emailNormalized LIKE :prefix OR LOWER(user.displayName) LIKE :prefix THEN 1 ELSE 2 END', 'ASC')
      .addOrderBy('user.emailNormalized', 'ASC', 'NULLS LAST').addOrderBy('user.displayName', 'ASC', 'NULLS LAST').addOrderBy('user.id', 'ASC')
      .setParameters({ exact: normalized, prefix }).skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await builder.getManyAndCount();
    return { items: rows.map((user) => this.map(user)), page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 };
  }

  private map(user: User): AdminUserSearchItemDto { return { id: user.id, email: user.email, displayName: user.displayName, status: user.status, roles: user.roles, providerLink: user.provider ? { providerId: user.provider.id, providerDisplayName: user.provider.displayName } : null }; }
}
