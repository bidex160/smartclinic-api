import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { AdminUserSearchService } from './admin-user-search.service';
import { AdminUserSearchQueryDto } from './dto/admin-user-search.dto';

const user = (changes = {}) => ({ id: '10000000-0000-4000-8000-000000000001', email: 'ada@example.com', emailNormalized: 'ada@example.com', displayName: 'Ada Okafor', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null, provider: null, credential: { passwordHash: 'secret' }, sessions: [{ tokenHash: 'secret' }], ...changes });

describe('AdminUserSearchService', () => {
  let builder: any, subject: AdminUserSearchService;
  beforeEach(() => {
    builder = { withDeleted: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), setParameters: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([[user()], 1]) };
    subject = new AdminUserSearchService({ createQueryBuilder: jest.fn().mockReturnValue(builder) } as never);
  });

  it.each(['ada@example.com', 'ADA@EXAMPLE.COM', 'Ada', 'da@exam'])('searches normalized email and display name case-insensitively for %s', async (q) => { const result = await subject.search({ q, page: 1, limit: 20 }); expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('emailNormalized ILIKE'), { contains: `%${q.toLowerCase()}%` }); expect(result.items[0]).toMatchObject({ email: 'ada@example.com', displayName: 'Ada Okafor', status: UserStatus.ACTIVE }); });
  it('orders exact email, then prefix, then deterministically by identity and id', async () => { await subject.search({ q: 'ADA@example.com', page: 1, limit: 20 }); expect(builder.orderBy).toHaveBeenCalledWith(expect.stringContaining('emailNormalized = :exact'), 'ASC'); expect(builder.setParameters).toHaveBeenCalledWith({ exact: 'ada@example.com', prefix: 'ada@example.com%' }); expect(builder.addOrderBy).toHaveBeenLastCalledWith('user.id', 'ASC'); });
  it('excludes soft-deleted users explicitly', async () => { await subject.search({ q: 'ada', page: 1, limit: 20 }); expect(builder.withDeleted).toHaveBeenCalled(); expect(builder.where).toHaveBeenCalledWith('user.deletedAt IS NULL'); });
  it('paginates with metadata', async () => { builder.getManyAndCount.mockResolvedValue([[user()], 41]); const result = await subject.search({ q: 'ada', page: 2, limit: 20 }); expect(builder.skip).toHaveBeenCalledWith(20); expect(builder.take).toHaveBeenCalledWith(20); expect(result).toMatchObject({ page: 2, limit: 20, total: 41, totalPages: 3 }); });
  it('shows a safe provider link without credentials or sessions', async () => { builder.getManyAndCount.mockResolvedValue([[user({ provider: { id: 'provider-id', displayName: 'SmartClinic Ikeja', professionalReference: 'private' } })], 1]); const item: any = (await subject.search({ q: 'ada', page: 1, limit: 20 })).items[0]; expect(item.providerLink).toEqual({ providerId: 'provider-id', providerDisplayName: 'SmartClinic Ikeja' }); expect(item).not.toHaveProperty('credential'); expect(item).not.toHaveProperty('sessions'); expect(JSON.stringify(item)).not.toContain('passwordHash'); });
  it('requires a useful query length and enforces the maximum', async () => { expect(await validate(plainToInstance(AdminUserSearchQueryDto, { q: 'a' }))).not.toHaveLength(0); expect(await validate(plainToInstance(AdminUserSearchQueryDto, { q: 'a'.repeat(101) }))).not.toHaveLength(0); expect(await validate(plainToInstance(AdminUserSearchQueryDto, { q: 'ad' }))).toHaveLength(0); });
});
