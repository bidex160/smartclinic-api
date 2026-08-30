import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { CommissionResolutionService } from '../commissions/commission-resolution.service';
import { calculateCommission } from '../commissions/commission-calculator';
import { CommissionRateSource } from '../commissions/enums/commission-rate-source.enum';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { PaymentTransactionStatus } from '../payments/enums/payment-transaction-status.enum';
import { PaymentTransactionType } from '../payments/enums/payment-transaction-type.enum';
import { Provider } from '../providers/entities/provider.entity';
import { RewardBookingRedemption } from '../rewards/entities/reward-booking-redemption.entity';
import { RewardBookingRedemptionStatus } from '../rewards/enums/reward-booking-redemption-status.enum';
import { User } from '../users/entities/user.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { AdminProviderEarningListQueryDto, ProviderEarningListQueryDto } from './dto/provider-earning.dto';
import { ProviderEarning } from './entities/provider-earning.entity';
import { ProviderEarningStatusHistory } from './entities/provider-earning-status-history.entity';
import { ProviderEarningSourceType } from './enums/provider-earning-source-type.enum';
import { ProviderEarningStatus } from './enums/provider-earning-status.enum';

@Injectable()
export class ProviderEarningsService {
  constructor(@InjectRepository(ProviderEarning) private readonly earnings: Repository<ProviderEarning>, @InjectRepository(Provider) private readonly providers: Repository<Provider>, private readonly commissions: CommissionResolutionService) {}

  async createHeldHealthCheckEarning(manager: EntityManager, booking: Booking, paymentTransaction: PaymentTransaction | null): Promise<ProviderEarning> {
    if (!booking.commercialProviderId || !booking.quotedAmount || !booking.currency) throw new ConflictException('Health Check booking has no authoritative Provider commercial snapshot');
    const sourceType = ProviderEarningSourceType.HEALTH_CHECK;
    const repository = manager.getRepository(ProviderEarning);
    const existing = await repository.findOne({ where: { sourceType, sourceReference: booking.bookingReference }, lock: { mode: 'pessimistic_write' } });
    if (existing) {
      if (paymentTransaction && existing.paymentTransactionId && existing.paymentTransactionId !== paymentTransaction.id) throw new ConflictException('Health Check earning belongs to another payment transaction');
      return existing;
    }
    if (paymentTransaction) {
      if (paymentTransaction.status !== PaymentTransactionStatus.SUCCEEDED || paymentTransaction.transactionType !== PaymentTransactionType.COLLECTION) throw new ConflictException('Provider earning requires a successful collection transaction');
      if (paymentTransaction.currency !== booking.currency) throw new ConflictException('Payment transaction currency does not match the Health Check commercial snapshot');
    }
    const grossMinor = this.toMinor(booking.quotedAmount);
    const redemption = await manager.getRepository(RewardBookingRedemption).findOne({ where: { bookingId: booking.id, status: RewardBookingRedemptionStatus.SETTLED } });
    const fundedMinor = (paymentTransaction ? this.toMinor(paymentTransaction.amount) : 0n) + (redemption ? BigInt(redemption.amountMinor) : 0n);
    if (fundedMinor !== grossMinor) throw new ConflictException('Settled funding does not match the Health Check commercial snapshot');
    const resolution = await this.commissions.requireForProvider(booking.commercialProviderId, manager);
    const calculation = calculateCommission(grossMinor, resolution.rateBasisPoints);
    const status = booking.status === BookingStatus.COMPLETED ? ProviderEarningStatus.PAYABLE : ProviderEarningStatus.HELD;
    const now = new Date();
    const earning = await repository.save(repository.create({ providerId: booking.commercialProviderId, paymentTransactionId: paymentTransaction?.id ?? null, sourceType, sourceReference: booking.bookingReference, currency: booking.currency, grossAmountMinor: grossMinor.toString(), commissionBps: resolution.rateBasisPoints, commissionSource: resolution.source, commissionAmountMinor: calculation.commissionAmountMinor.toString(), providerShareMinor: calculation.providerShareMinor.toString(), status, payableAt: status === ProviderEarningStatus.PAYABLE ? now : null, settledAt: null }));
    await manager.getRepository(ProviderEarningStatusHistory).save({ providerEarningId: earning.id, fromStatus: null, toStatus: status, actorUserId: null, reasonCode: status === ProviderEarningStatus.PAYABLE ? 'HEALTH_CHECK_ALREADY_COMPLETED' : 'HEALTH_CHECK_PAYMENT_SETTLED', reasonNote: null });
    return earning;
  }

  async createHeldGeneralCareEarning(manager: EntityManager, care: CareRequest, paymentTransaction: PaymentTransaction): Promise<ProviderEarning> {
    if (!care.assignedProviderId || care.servicePriceMinor == null || !care.serviceCurrency || BigInt(care.servicePriceMinor) <= 0n) throw new ConflictException('General Care request has no paid Provider commercial snapshot');
    if (paymentTransaction.status !== PaymentTransactionStatus.SUCCEEDED || paymentTransaction.transactionType !== PaymentTransactionType.COLLECTION || paymentTransaction.currency !== care.serviceCurrency || this.toMinor(paymentTransaction.amount) !== BigInt(care.servicePriceMinor)) throw new ConflictException('Payment transaction does not match the General Care commercial snapshot');
    const repository = manager.getRepository(ProviderEarning); const sourceType = ProviderEarningSourceType.GENERAL_CARE;
    const existing = await repository.findOne({ where: { sourceType, sourceReference: care.reference }, lock: { mode: 'pessimistic_write' } });
    if (existing) { if (existing.paymentTransactionId !== paymentTransaction.id) throw new ConflictException('General Care earning belongs to another payment transaction'); return existing; }
    const resolution = await this.commissions.requireForProvider(care.assignedProviderId, manager); const calculation = calculateCommission(BigInt(care.servicePriceMinor), resolution.rateBasisPoints);
    const earning = await repository.save(repository.create({ providerId: care.assignedProviderId, paymentTransactionId: paymentTransaction.id, sourceType, sourceReference: care.reference, currency: care.serviceCurrency, grossAmountMinor: care.servicePriceMinor, commissionBps: resolution.rateBasisPoints, commissionSource: resolution.source, commissionAmountMinor: calculation.commissionAmountMinor.toString(), providerShareMinor: calculation.providerShareMinor.toString(), status: ProviderEarningStatus.HELD, payableAt: null, settledAt: null }));
    await manager.getRepository(ProviderEarningStatusHistory).save({ providerEarningId: earning.id, fromStatus: null, toStatus: ProviderEarningStatus.HELD, actorUserId: null, reasonCode: 'GENERAL_CARE_PAYMENT_SETTLED', reasonNote: null }); return earning;
  }

  async markGeneralCarePayable(manager: EntityManager, careRequestReference: string, actorUserId: string): Promise<ProviderEarning | null> {
    const repository = manager.getRepository(ProviderEarning); const earning = await repository.findOne({ where: { sourceType: ProviderEarningSourceType.GENERAL_CARE, sourceReference: careRequestReference }, lock: { mode: 'pessimistic_write' } });
    if (!earning) return null; if ([ProviderEarningStatus.PAYABLE, ProviderEarningStatus.SETTLED].includes(earning.status)) return earning; if (earning.status !== ProviderEarningStatus.HELD) throw new ConflictException(`Provider earning in ${earning.status} cannot become payable`);
    earning.status = ProviderEarningStatus.PAYABLE; earning.payableAt = new Date(); await repository.save(earning); await manager.getRepository(ProviderEarningStatusHistory).save({ providerEarningId: earning.id, fromStatus: ProviderEarningStatus.HELD, toStatus: ProviderEarningStatus.PAYABLE, actorUserId, reasonCode: 'GENERAL_CARE_COMPLETED', reasonNote: null }); return earning;
  }
  async createHeldPharmacyFulfillmentEarning(manager:EntityManager,input:{providerId:string;fulfillmentReference:string;grossAmountMinor:string;currency:string;commissionBps:number;commissionSource:CommissionRateSource;commissionAmountMinor:string;providerShareMinor:string;paymentTransaction:PaymentTransaction}){const repository=manager.getRepository(ProviderEarning);const sourceType=ProviderEarningSourceType.PHARMACY_FULFILLMENT;const existing=await repository.findOne({where:{sourceType,sourceReference:input.fulfillmentReference},lock:{mode:'pessimistic_write'}});if(existing){if(existing.paymentTransactionId!==input.paymentTransaction.id)throw new ConflictException('Pharmacy earning belongs to another payment transaction');return existing;}const gross=BigInt(input.grossAmountMinor),commission=BigInt(input.commissionAmountMinor),providerShare=BigInt(input.providerShareMinor);if(input.paymentTransaction.status!==PaymentTransactionStatus.SUCCEEDED||input.paymentTransaction.transactionType!==PaymentTransactionType.COLLECTION||input.paymentTransaction.currency!==input.currency||this.toMinor(input.paymentTransaction.amount)!==gross||input.commissionBps<0||input.commissionBps>10000||commission<0n||providerShare<0n||commission+providerShare!==gross)throw new ConflictException('Payment transaction does not match pharmacy funding snapshot');const earning=await repository.save(repository.create({providerId:input.providerId,paymentTransactionId:input.paymentTransaction.id,sourceType,sourceReference:input.fulfillmentReference,currency:input.currency,grossAmountMinor:input.grossAmountMinor,commissionBps:input.commissionBps,commissionSource:input.commissionSource,commissionAmountMinor:input.commissionAmountMinor,providerShareMinor:input.providerShareMinor,status:ProviderEarningStatus.HELD,payableAt:null,settledAt:null}));await manager.getRepository(ProviderEarningStatusHistory).save({providerEarningId:earning.id,fromStatus:null,toStatus:ProviderEarningStatus.HELD,actorUserId:null,reasonCode:'PHARMACY_PAYMENT_SETTLED',reasonNote:null});return earning;}
  async markPharmacyFulfillmentPayable(manager:EntityManager,reference:string,actorUserId:string){const repository=manager.getRepository(ProviderEarning);const earning=await repository.findOne({where:{sourceType:ProviderEarningSourceType.PHARMACY_FULFILLMENT,sourceReference:reference},lock:{mode:'pessimistic_write'}});if(!earning)return null;if([ProviderEarningStatus.PAYABLE,ProviderEarningStatus.SETTLED].includes(earning.status))return earning;if(earning.status!==ProviderEarningStatus.HELD)throw new ConflictException('Pharmacy earning cannot become payable');earning.status=ProviderEarningStatus.PAYABLE;earning.payableAt=new Date();await repository.save(earning);await manager.getRepository(ProviderEarningStatusHistory).save({providerEarningId:earning.id,fromStatus:ProviderEarningStatus.HELD,toStatus:ProviderEarningStatus.PAYABLE,actorUserId,reasonCode:'PHARMACY_HANDOVER_COMPLETED',reasonNote:null});return earning;}

  async createHeldPatientConnectionEarning(manager: EntityManager, input: { providerId: string; sourceType: ProviderEarningSourceType.PATIENT_REGISTRATION | ProviderEarningSourceType.PATIENT_LINKING; sourceReference: string; grossAmountMinor: string; currency: string; paymentTransaction: PaymentTransaction }): Promise<ProviderEarning> {
    const repository = manager.getRepository(ProviderEarning);
    const existing = await repository.findOne({ where: { sourceType: input.sourceType, sourceReference: input.sourceReference }, lock: { mode: 'pessimistic_write' } });
    if (existing) { if (existing.paymentTransactionId !== input.paymentTransaction.id) throw new ConflictException('Patient connection earning belongs to another payment transaction'); return existing; }
    if (input.paymentTransaction.status !== PaymentTransactionStatus.SUCCEEDED || input.paymentTransaction.transactionType !== PaymentTransactionType.COLLECTION || input.paymentTransaction.currency !== input.currency || this.toMinor(input.paymentTransaction.amount) !== BigInt(input.grossAmountMinor)) throw new ConflictException('Payment transaction does not match the Patient connection commercial snapshot');
    const resolution = await this.commissions.requireForProvider(input.providerId, manager); const calculation = calculateCommission(BigInt(input.grossAmountMinor), resolution.rateBasisPoints);
    const earning = await repository.save(repository.create({ providerId: input.providerId, paymentTransactionId: input.paymentTransaction.id, sourceType: input.sourceType, sourceReference: input.sourceReference, currency: input.currency, grossAmountMinor: input.grossAmountMinor, commissionBps: resolution.rateBasisPoints, commissionSource: resolution.source, commissionAmountMinor: calculation.commissionAmountMinor.toString(), providerShareMinor: calculation.providerShareMinor.toString(), status: ProviderEarningStatus.HELD, payableAt: null, settledAt: null }));
    await manager.getRepository(ProviderEarningStatusHistory).save({ providerEarningId: earning.id, fromStatus: null, toStatus: ProviderEarningStatus.HELD, actorUserId: null, reasonCode: 'PATIENT_CONNECTION_PAYMENT_SETTLED', reasonNote: null }); return earning;
  }

  async markPatientConnectionPayable(manager: EntityManager, sourceReference: string, actorUserId: string): Promise<void> {
    const repository = manager.getRepository(ProviderEarning); const rows = await repository.createQueryBuilder('earning').setLock('pessimistic_write').where('earning.sourceReference = :sourceReference', { sourceReference }).andWhere('earning.sourceType IN (:...types)', { types: [ProviderEarningSourceType.PATIENT_REGISTRATION, ProviderEarningSourceType.PATIENT_LINKING] }).getMany();
    for (const earning of rows) { if ([ProviderEarningStatus.PAYABLE, ProviderEarningStatus.SETTLED].includes(earning.status)) continue; if (earning.status !== ProviderEarningStatus.HELD) throw new ConflictException(`Provider earning in ${earning.status} cannot become payable`); earning.status = ProviderEarningStatus.PAYABLE; earning.payableAt = new Date(); await repository.save(earning); await manager.getRepository(ProviderEarningStatusHistory).save({ providerEarningId: earning.id, fromStatus: ProviderEarningStatus.HELD, toStatus: ProviderEarningStatus.PAYABLE, actorUserId, reasonCode: 'PATIENT_CONNECTION_CONNECTED', reasonNote: null }); }
  }

  async markHealthCheckPayable(manager: EntityManager, bookingId: string, actorUserId: string): Promise<ProviderEarning | null> {
    const booking = await manager.getRepository(Booking).findOne({ where: { id: bookingId }, lock: { mode: 'pessimistic_write' } });
    if (!booking || booking.status !== BookingStatus.COMPLETED) throw new ConflictException('Health Check must be completed before Provider earnings become payable');
    const repository = manager.getRepository(ProviderEarning);
    const earning = await repository.findOne({ where: { sourceType: ProviderEarningSourceType.HEALTH_CHECK, sourceReference: booking.bookingReference }, lock: { mode: 'pessimistic_write' } });
    if (!earning) return null;
    if (earning.status === ProviderEarningStatus.PAYABLE || earning.status === ProviderEarningStatus.SETTLED) return earning;
    if (earning.status !== ProviderEarningStatus.HELD) throw new ConflictException(`Provider earning in ${earning.status} cannot become payable`);
    earning.status = ProviderEarningStatus.PAYABLE; earning.payableAt = new Date(); await repository.save(earning);
    await manager.getRepository(ProviderEarningStatusHistory).save({ providerEarningId: earning.id, fromStatus: ProviderEarningStatus.HELD, toStatus: ProviderEarningStatus.PAYABLE, actorUserId, reasonCode: 'HEALTH_CHECK_COMPLETED', reasonNote: null });
    return earning;
  }

  async resolveProviderForRead(user: User): Promise<Provider> {
    const provider = await this.providers.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!provider || provider.deletedAt) throw new NotFoundException('Provider earnings were not found');
    return provider;
  }
  async listOwn(user: User, query: ProviderEarningListQueryDto) { const provider = await this.resolveProviderForRead(user); return this.listForProvider(provider.id, query); }
  async getOwn(user: User, reference: string) { const provider = await this.resolveProviderForRead(user); return this.getForProvider(provider.id, reference); }
  async balancesOwn(user: User) { const provider = await this.resolveProviderForRead(user); return this.balances(provider.id); }
  async listAdmin(query: AdminProviderEarningListQueryDto) { return this.listForProvider(query.providerId, query, true); }
  async getAdmin(reference: string) { const earning = await this.earnings.findOne({ where: { reference }, relations: { provider: true } }); if (!earning) throw new NotFoundException('Provider earning not found'); return this.map(earning, true); }
  async balancesAdmin(providerId?: string) { return this.balances(providerId); }

  private async listForProvider(providerId: string | undefined, query: ProviderEarningListQueryDto, includeProvider = false) {
    const qb = this.earnings.createQueryBuilder('earning');
    if (includeProvider) qb.innerJoinAndSelect('earning.provider', 'provider');
    if (providerId) qb.andWhere('earning.providerId = :providerId', { providerId });
    if (query.status) qb.andWhere('earning.status = :status', { status: query.status });
    if (query.sourceType) qb.andWhere('earning.sourceType = :sourceType', { sourceType: query.sourceType });
    if ((query as AdminProviderEarningListQueryDto).currency) qb.andWhere('earning.currency = :currency', { currency: (query as AdminProviderEarningListQueryDto).currency!.toUpperCase() });
    qb.orderBy('earning.createdAt', 'DESC').addOrderBy('earning.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount(); return { items: rows.map(row => this.map(row, includeProvider)), page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 };
  }
  private async getForProvider(providerId: string, reference: string) { const earning = await this.earnings.findOne({ where: { providerId, reference } }); if (!earning) throw new NotFoundException('Provider earning not found'); return this.map(earning); }
  private async balances(providerId?: string) {
    const qb = this.earnings.createQueryBuilder('earning').select('earning.currency', 'currency').addSelect(`COALESCE(SUM(CASE WHEN earning.status = 'HELD' THEN earning.provider_share_minor ELSE 0 END), 0)`, 'held').addSelect(`COALESCE(SUM(CASE WHEN earning.status = 'PAYABLE' THEN earning.provider_share_minor ELSE 0 END), 0)`, 'payable').addSelect(`COALESCE(SUM(CASE WHEN earning.status = 'SETTLED' THEN earning.provider_share_minor ELSE 0 END), 0)`, 'settled').groupBy('earning.currency').orderBy('earning.currency', 'ASC');
    if (providerId) qb.where('earning.providerId = :providerId', { providerId });
    const rows = await qb.getRawMany(); return rows.map(row => ({ currency: row.currency, heldAmountMinor: Number(row.held), payableAmountMinor: Number(row.payable), settledAmountMinor: Number(row.settled) }));
  }
  private map(row: ProviderEarning, includeProvider = false) { return { reference: row.reference, sourceType: row.sourceType, sourceReference: row.sourceReference, currency: row.currency, grossAmountMinor: Number(row.grossAmountMinor), commissionBasisPoints: row.commissionBps, commissionSource: row.commissionSource, commissionAmountMinor: Number(row.commissionAmountMinor), providerShareMinor: Number(row.providerShareMinor), status: row.status, payableAt: row.payableAt, settledAt: row.settledAt, createdAt: row.createdAt, updatedAt: row.updatedAt, ...(includeProvider ? { provider: { reference: row.provider.providerReference, displayName: row.provider.displayName } } : {}) }; }
  private toMinor(amount: string): bigint { const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount); if (!match) throw new ConflictException('Invalid authoritative money amount'); return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')); }
}
