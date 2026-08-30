import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { AdminProviderPayoutListQueryDto, CompleteProviderPayoutDto, CreateProviderPayoutDto, EligibleProviderEarningQueryDto, ProviderPayoutListQueryDto } from './dto/provider-payout.dto';
import { ProviderEarningStatusHistory } from './entities/provider-earning-status-history.entity';
import { ProviderEarning } from './entities/provider-earning.entity';
import { ProviderPayoutEarning } from './entities/provider-payout-earning.entity';
import { ProviderPayoutStatusHistory } from './entities/provider-payout-status-history.entity';
import { ProviderPayout } from './entities/provider-payout.entity';
import { ProviderPayoutAccount } from './entities/provider-payout-account.entity';
import { ProviderEarningStatus } from './enums/provider-earning-status.enum';
import { ProviderPayoutStatus } from './enums/provider-payout-status.enum';
import { ProviderPayoutAccountStatus, ProviderPayoutAccountType } from './enums/provider-payout-account.enum';
import { ProviderPayoutSettlementMethod } from './enums/provider-payout-settlement-method.enum';

const ACTIVE = [ProviderPayoutStatus.DRAFT, ProviderPayoutStatus.PROCESSING];

@Injectable()
export class ProviderPayoutsService {
  constructor(
    @InjectRepository(ProviderPayout) private readonly payouts: Repository<ProviderPayout>,
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
  ) {}

  async create(actorUserId: string, input: CreateProviderPayoutDto) {
    try {
      const reference = await this.payouts.manager.transaction(async manager => {
        const provider = await manager.getRepository(Provider).findOne({ where: { providerReference: input.providerReference }, lock: { mode: 'pessimistic_read' } });
        if (!provider || provider.deletedAt) throw new NotFoundException('Provider not found');
        const references = input.earningReferences.map(value => value.toUpperCase());
        if (new Set(references).size !== references.length) throw new ConflictException('Duplicate earning references are not allowed');
        references.sort();
        const earnings = await manager.getRepository(ProviderEarning).createQueryBuilder('earning')
          .where('earning.reference IN (:...references)', { references }).setLock('pessimistic_write').getMany();
        if (earnings.length !== references.length) throw new NotFoundException('One or more Provider earnings were not found');
        const currency = input.currency.toUpperCase();
        if (earnings.some(earning => earning.status !== ProviderEarningStatus.PAYABLE)) throw new ConflictException('Only PAYABLE earnings can be included in a payout');
        if (earnings.some(earning => earning.providerId !== provider.id)) throw new ConflictException('All earnings must belong to the selected Provider');
        if (earnings.some(earning => earning.currency !== currency)) throw new ConflictException('All earnings must use the payout currency');
        const payoutAccount = input.payoutAccountReference ? await manager.getRepository(ProviderPayoutAccount).findOne({ where: { reference: input.payoutAccountReference.toUpperCase() }, lock: { mode: 'pessimistic_read' } }) : null;
        if (input.payoutAccountReference) this.validatePayoutAccount(payoutAccount, provider.id, currency, input.settlementMethod);
        const total = earnings.reduce((sum, earning) => sum + BigInt(earning.providerShareMinor), 0n);
        const repository = manager.getRepository(ProviderPayout);
        const payout = await repository.save(repository.create({ providerId: provider.id, currency, totalAmountMinor: total.toString(), earningCount: earnings.length, status: ProviderPayoutStatus.DRAFT, settlementMethod: input.settlementMethod, providerPayoutAccountId: payoutAccount?.id ?? null, destinationSnapshot: payoutAccount ? this.destinationSnapshot(payoutAccount) : null, externalReference: null, note: input.note?.trim() || null, initiatedByUserId: actorUserId, processingAt: null, completedAt: null, failedAt: null, cancelledAt: null }));
        const memberships = earnings.map(earning => manager.getRepository(ProviderPayoutEarning).create({ payoutId: payout.id, providerEarningId: earning.id, providerShareMinor: earning.providerShareMinor, releasedAt: null }));
        await manager.getRepository(ProviderPayoutEarning).save(memberships);
        await this.history(manager, payout, null, ProviderPayoutStatus.DRAFT, actorUserId, payoutAccount ? 'PAYOUT_CREATED_WITH_DESTINATION' : 'PAYOUT_CREATED', payout.note);
        return payout.reference;
      });
      return this.adminDetail(reference);
    } catch (error) {
      if (error instanceof QueryFailedError && (error as any).driverError?.code === '23505') throw new ConflictException('One or more earnings are already reserved by another payout');
      throw error;
    }
  }

  async process(reference: string, actorUserId: string) { const result = await this.payouts.manager.transaction(async manager => { const payout = await this.lockPayout(manager, reference); if (payout.status === ProviderPayoutStatus.PROCESSING) return payout.reference; if (payout.status !== ProviderPayoutStatus.DRAFT) throw new ConflictException('Payout cannot make this status transition'); if (payout.providerPayoutAccountId) { const account = await manager.getRepository(ProviderPayoutAccount).findOne({ where: { id: payout.providerPayoutAccountId }, lock: { mode: 'pessimistic_read' } }); this.validatePayoutAccount(account, payout.providerId, payout.currency, payout.settlementMethod); } payout.status = ProviderPayoutStatus.PROCESSING; payout.processingAt = new Date(); await manager.getRepository(ProviderPayout).save(payout); await this.history(manager, payout, ProviderPayoutStatus.DRAFT, ProviderPayoutStatus.PROCESSING, actorUserId, 'PAYOUT_PROCESSING', null); return payout.reference; }); return this.adminDetail(result); }
  fail(reference: string, actorUserId: string, reason: string) { return this.transition(reference, actorUserId, [ProviderPayoutStatus.PROCESSING], ProviderPayoutStatus.FAILED, 'PAYOUT_FAILED', reason, true); }
  cancel(reference: string, actorUserId: string, reason: string) { return this.transition(reference, actorUserId, ACTIVE, ProviderPayoutStatus.CANCELLED, 'PAYOUT_CANCELLED', reason, true); }

  async complete(reference: string, actorUserId: string, input: CompleteProviderPayoutDto) {
    const normalizedReference = reference.toUpperCase();
    const result = await this.payouts.manager.transaction(async manager => {
      const payout = await this.lockPayout(manager, normalizedReference);
      if (payout.status === ProviderPayoutStatus.COMPLETED) return payout.reference;
      if (payout.status !== ProviderPayoutStatus.PROCESSING) throw new ConflictException('Payout cannot be completed from its current status');
      const externalReference = input.externalReference.trim();
      const conflict = await manager.getRepository(ProviderPayout).findOne({ where: { externalReference } });
      if (conflict && conflict.id !== payout.id) throw new ConflictException('Settlement reference has already been recorded');
      const memberships = await manager.getRepository(ProviderPayoutEarning).find({ where: { payoutId: payout.id } });
      if (memberships.length !== payout.earningCount) throw new ConflictException('Payout membership count no longer matches its snapshot');
      const earningIds = memberships.map(item => item.providerEarningId);
      const earnings = await manager.getRepository(ProviderEarning).createQueryBuilder('earning').where('earning.id IN (:...earningIds)', { earningIds }).setLock('pessimistic_write').getMany();
      if (earnings.length !== payout.earningCount) throw new ConflictException('Payout earnings could not be fully resolved');
      if (earnings.some(earning => earning.status !== ProviderEarningStatus.PAYABLE || earning.providerId !== payout.providerId || earning.currency !== payout.currency)) throw new ConflictException('Payout earnings are no longer eligible for settlement');
      const membershipTotal = memberships.reduce((sum, item) => sum + BigInt(item.providerShareMinor), 0n);
      const currentTotal = earnings.reduce((sum, earning) => sum + BigInt(earning.providerShareMinor), 0n);
      if (membershipTotal !== BigInt(payout.totalAmountMinor) || currentTotal !== membershipTotal) throw new ConflictException('Payout total no longer matches its immutable membership');
      const completedAt = new Date();
      const earningRepository = manager.getRepository(ProviderEarning);
      const earningHistory = manager.getRepository(ProviderEarningStatusHistory);
      for (const earning of earnings) {
        earning.status = ProviderEarningStatus.SETTLED; earning.settledAt = completedAt;
        await earningRepository.save(earning);
        await earningHistory.save(earningHistory.create({ providerEarningId: earning.id, fromStatus: ProviderEarningStatus.PAYABLE, toStatus: ProviderEarningStatus.SETTLED, actorUserId, reasonCode: 'PROVIDER_PAYOUT_COMPLETED', reasonNote: payout.reference }));
      }
      payout.status = ProviderPayoutStatus.COMPLETED; payout.completedAt = completedAt; payout.externalReference = externalReference; payout.note = input.note?.trim() || payout.note;
      await manager.getRepository(ProviderPayout).save(payout);
      await this.history(manager, payout, ProviderPayoutStatus.PROCESSING, ProviderPayoutStatus.COMPLETED, actorUserId, 'PAYOUT_COMPLETED', payout.note);
      return payout.reference;
    });
    return this.adminDetail(result);
  }

  async eligible(query: EligibleProviderEarningQueryDto) {
    const provider = await this.providers.findOne({ where: { providerReference: query.providerReference } });
    if (!provider) throw new NotFoundException('Provider not found');
    const qb = this.payouts.manager.getRepository(ProviderEarning).createQueryBuilder('earning')
      .where('earning.providerId = :providerId', { providerId: provider.id }).andWhere('earning.status = :status', { status: ProviderEarningStatus.PAYABLE })
      .andWhere('earning.currency = :currency', { currency: query.currency.toUpperCase() })
      .andWhere(`NOT EXISTS (SELECT 1 FROM provider_payout_earnings reservation WHERE reservation.provider_earning_id = earning.id AND reservation.released_at IS NULL)`)
      .orderBy('earning.payableAt', 'ASC').addOrderBy('earning.id', 'ASC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return this.page(rows.map(earning => ({ reference: earning.reference, sourceType: earning.sourceType, sourceReference: earning.sourceReference, providerShareMinor: Number(earning.providerShareMinor), currency: earning.currency, payableAt: earning.payableAt, createdAt: earning.createdAt })), total, query);
  }

  async listMine(user: User, query: ProviderPayoutListQueryDto) { const provider = await this.resolveProvider(user); return this.list(query, provider.id, false); }
  async detailMine(user: User, reference: string) { const provider = await this.resolveProvider(user); return this.detail(reference, provider.id, false); }
  adminList(query: AdminProviderPayoutListQueryDto) { return this.list(query, undefined, true); }
  adminDetail(reference: string) { return this.detail(reference, undefined, true); }

  private async list(query: AdminProviderPayoutListQueryDto | ProviderPayoutListQueryDto, providerId?: string, admin = false) {
    const qb = this.payouts.createQueryBuilder('payout'); if (admin) qb.innerJoinAndSelect('payout.provider', 'provider');
    if (providerId) qb.andWhere('payout.providerId = :providerId', { providerId });
    if ((query as AdminProviderPayoutListQueryDto).providerReference) qb.andWhere('provider.providerReference = :providerReference', { providerReference: (query as AdminProviderPayoutListQueryDto).providerReference });
    if (query.status) qb.andWhere('payout.status = :status', { status: query.status });
    if (query.currency) qb.andWhere('payout.currency = :currency', { currency: query.currency.toUpperCase() });
    qb.orderBy('payout.createdAt', 'DESC').addOrderBy('payout.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount(); return this.page(rows.map(row => this.view(row, admin)), total, query);
  }
  private async detail(reference: string, providerId?: string, admin = false) {
    const qb = this.payouts.createQueryBuilder('payout').innerJoinAndSelect('payout.provider', 'provider').leftJoinAndSelect('payout.earnings', 'membership').leftJoinAndSelect('membership.earning', 'earning').leftJoinAndSelect('payout.history', 'history').where('payout.reference = :reference', { reference: reference.toUpperCase() });
    if (providerId) qb.andWhere('payout.providerId = :providerId', { providerId });
    const payout = await qb.getOne(); if (!payout) throw new NotFoundException('Provider payout not found');
    payout.earnings.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); payout.history.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { ...this.view(payout, admin), earnings: payout.earnings.map(item => ({ reference: item.earning.reference, sourceType: item.earning.sourceType, sourceReference: item.earning.sourceReference, providerShareMinor: Number(item.providerShareMinor), currency: payout.currency, payableAt: item.earning.payableAt, settledAt: item.earning.settledAt })), history: payout.history.map(item => ({ fromStatus: item.fromStatus, toStatus: item.toStatus, reasonCode: item.reasonCode, reasonNote: item.reasonNote, createdAt: item.createdAt })) };
  }
  private async transition(reference: string, actorUserId: string, allowed: ProviderPayoutStatus[], to: ProviderPayoutStatus, reasonCode: string, note: string | null, release: boolean) {
    const result = await this.payouts.manager.transaction(async manager => { const payout = await this.lockPayout(manager, reference); if (payout.status === to) return payout.reference; if (!allowed.includes(payout.status)) throw new ConflictException('Payout cannot make this status transition'); const from = payout.status; payout.status = to; const now = new Date(); if (to === ProviderPayoutStatus.PROCESSING) payout.processingAt = now; if (to === ProviderPayoutStatus.FAILED) payout.failedAt = now; if (to === ProviderPayoutStatus.CANCELLED) payout.cancelledAt = now; payout.note = note?.trim() || payout.note; await manager.getRepository(ProviderPayout).save(payout); if (release) await manager.getRepository(ProviderPayoutEarning).createQueryBuilder().update().set({ releasedAt: now }).where('payout_id = :payoutId AND released_at IS NULL', { payoutId: payout.id }).execute(); await this.history(manager, payout, from, to, actorUserId, reasonCode, payout.note); return payout.reference; });
    return this.adminDetail(result);
  }
  private async lockPayout(manager: EntityManager, reference: string) { const payout = await manager.getRepository(ProviderPayout).findOne({ where: { reference: reference.toUpperCase() }, lock: { mode: 'pessimistic_write' } }); if (!payout) throw new NotFoundException('Provider payout not found'); return payout; }
  private async resolveProvider(user: User) { const provider = await this.providers.findOne({ where: { userId: user.id }, withDeleted: true }); if (!provider || provider.deletedAt) throw new NotFoundException('Provider payouts were not found'); return provider; }
  private async history(manager: EntityManager, payout: ProviderPayout, fromStatus: ProviderPayoutStatus | null, toStatus: ProviderPayoutStatus, actorUserId: string, reasonCode: string, reasonNote: string | null) { const repository = manager.getRepository(ProviderPayoutStatusHistory); await repository.save(repository.create({ payoutId: payout.id, fromStatus, toStatus, actorUserId, reasonCode, reasonNote })); }
  private validatePayoutAccount(account: ProviderPayoutAccount | null, providerId: string, currency: string, settlementMethod: ProviderPayoutSettlementMethod) { if (!account) throw new NotFoundException('Provider payout account not found'); if (account.providerId !== providerId) throw new ConflictException('Payout account does not belong to the selected Provider'); if (account.status !== ProviderPayoutAccountStatus.VERIFIED) throw new ConflictException('Payout account must be VERIFIED'); if (account.currency !== currency) throw new ConflictException('Payout account currency does not match the payout'); if (settlementMethod === ProviderPayoutSettlementMethod.MANUAL_BANK_TRANSFER && account.type !== ProviderPayoutAccountType.BANK_ACCOUNT) throw new ConflictException('Payout account is not valid for manual bank transfer'); }
  private destinationSnapshot(account: ProviderPayoutAccount) { return { payoutAccountReference: account.reference, type: account.type, countryCode: account.countryCode, currency: account.currency, bankCode: account.bankCode, bankName: account.bankName, maskedAccountNumber: `****${account.accountNumberLast4}`, accountName: account.accountName }; }
  private view(payout: ProviderPayout, admin: boolean) { return { reference: payout.reference, ...(admin ? { provider: { reference: payout.provider.providerReference, displayName: payout.provider.displayName } } : {}), currency: payout.currency, totalAmountMinor: Number(payout.totalAmountMinor), earningCount: payout.earningCount, status: payout.status, settlementMethod: payout.settlementMethod, destination: payout.destinationSnapshot ?? null, externalReference: payout.externalReference, note: payout.note, createdAt: payout.createdAt, processingAt: payout.processingAt, completedAt: payout.completedAt, failedAt: payout.failedAt, cancelledAt: payout.cancelledAt, updatedAt: payout.updatedAt }; }
  private page(items: unknown[], total: number, query: { page: number; limit: number }) { return { items, page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 }; }
}
