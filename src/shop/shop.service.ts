import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { feeFor } from '../checkups/free-checks.service';
import { CommissionRateSource } from '../commissions/enums/commission-rate-source.enum';
import { ProviderEarningStatusHistory } from '../earnings/entities/provider-earning-status-history.entity';
import { ProviderEarning } from '../earnings/entities/provider-earning.entity';
import { ProviderEarningSourceType } from '../earnings/enums/provider-earning-source-type.enum';
import { ProviderEarningStatus } from '../earnings/enums/provider-earning-status.enum';
import { normalizePhone } from '../facility-outreach/places';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient } from '../patients/entities/patient.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderType } from '../providers/enums/provider-type.enum';
import { RewardPointsLedger } from '../rewards/entities/reward-points-ledger.entity';
import { RewardLedgerDirection } from '../rewards/enums/reward-ledger-direction.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { PatientWalletEntry, PatientWalletEntryDirection, PatientWalletEntryType } from '../wallet/entities/patient-wallet-entry.entity';
import { PatientWallet } from '../wallet/entities/patient-wallet.entity';
import { DeliveryDetails, OrderLine, OrderStatus, PRODUCT_CATEGORIES, ProductCategory, ShopOrder, ShopOrderEvent, ShopProduct, ShopSupplierOffer } from './shop.entities';

const ACCEPT_HOURS = 4;
const MAX_QTY = 5;
const MAX_LINES = 6;
const SCHEDULER_MS = 15 * 60_000;
const OPEN: OrderStatus[] = ['AWAITING_SUPPLIER', 'ASSIGNED', 'ACCEPTED', 'OUT_FOR_DELIVERY'];
const CURRENCY: Record<string, string> = { NG: 'NGN', GH: 'GHS', RW: 'RWF' };

export interface ProductInput {
  sku: string; name: string; brand?: string | null; category: ProductCategory; description: string; highlights?: string[];
  imageUrl?: string | null; validationNote?: string | null; currency?: string; priceMinor: number; supplyCostMinor: number;
  referralBps?: number; includesReview?: boolean; storeStock?: number; active?: boolean; sortOrder?: number;
}

/**
 * The money split for one product: price = supplier cost + referral share + SmartClinic margin.
 * Throws if the price can't cover the cost and the referral share.
 */
export function split(price: number, supplyCost: number, referralBps: number) {
  const referral = Math.floor((price * referralBps) / 10_000);
  const margin = price - supplyCost - referral;
  return { referral, margin };
}

export function orderReference(): string {
  const a = 'ACDEFGHJKMNPQRTUVWXY34679';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += a[randomInt(0, a.length)];
  return `SC-ORD-${s}`;
}

/**
 * The SmartClinic health shop: validated home monitors and refills, paid from the wallet,
 * supplied and delivered by a pharmacy near the buyer (or SmartClinic's own store).
 */
@Injectable()
export class ShopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShopService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ShopProduct) private readonly products: Repository<ShopProduct>,
    @InjectRepository(ShopSupplierOffer) private readonly offers: Repository<ShopSupplierOffer>,
    @InjectRepository(ShopOrder) private readonly orders: Repository<ShopOrder>,
    @InjectRepository(ShopOrderEvent) private readonly events: Repository<ShopOrderEvent>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly current: CurrentProviderService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    this.interval = setInterval(() => {
      this.reassignOverdue().catch((e) => this.logger.warn(`Order reassignment failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, SCHEDULER_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  // ---------- Catalogue ----------

  async catalogue(category?: ProductCategory, currency = 'NGN') {
    const where = { active: true, currency, ...(category ? { category } : {}) };
    const rows = await this.products.find({ where, order: { sortOrder: 'ASC', priceMinor: 'ASC' } });
    return { items: rows.map((p) => this.publicProduct(p)), deliveryFeeMinor: this.deliveryFee(currency), currency };
  }

  async product(sku: string) {
    const p = await this.products.findOne({ where: { sku: sku.toUpperCase(), active: true } });
    if (!p) throw new NotFoundException('Product not found');
    return { ...this.publicProduct(p), deliveryFeeMinor: this.deliveryFee(p.currency) };
  }

  private publicProduct(p: ShopProduct) {
    return {
      id: p.id, sku: p.sku, name: p.name, brand: p.brand, category: p.category, description: p.description, highlights: p.highlights,
      imageUrl: p.imageUrl, validationNote: p.validationNote, priceMinor: p.priceMinor, currency: p.currency, includesReview: p.includesReview,
    };
  }

  // ---------- Buying ----------

  /** Pay from the wallet. If there isn't enough, nothing is charged and the shortfall comes back. */
  async checkout(user: User, input: { items: { sku: string; quantity: number }[]; delivery: DeliveryDetails; referralCode?: string | null }) {
    if (!input.items?.length || input.items.length > MAX_LINES) throw new BadRequestException('Add between 1 and 6 items');
    const patient = await this.patients.findOne({ where: { userId: user.id } });
    const delivery = this.cleanDelivery(input.delivery);
    const skus = [...new Set(input.items.map((i) => i.sku.toUpperCase()))];
    const found = await this.products.find({ where: { sku: In(skus), active: true } });
    if (found.length !== skus.length) throw new BadRequestException('Something in your basket is no longer available');
    const currency = found[0].currency;
    if (found.some((p) => p.currency !== currency)) throw new BadRequestException('Items must be in one currency');
    if ((CURRENCY[delivery.countryCode] ?? 'NGN') !== currency) throw new BadRequestException('We can’t deliver these items to that country yet');
    const lines: OrderLine[] = skus.map((sku) => {
      const p = found.find((x) => x.sku === sku)!;
      const quantity = input.items.filter((i) => i.sku.toUpperCase() === sku).reduce((n, i) => n + Math.round(i.quantity), 0);
      if (quantity < 1 || quantity > MAX_QTY) throw new BadRequestException(`Choose 1 to ${MAX_QTY} of each item`);
      return { productId: p.id, sku: p.sku, name: p.name, quantity, unitPriceMinor: p.priceMinor, unitSupplyCostMinor: p.supplyCostMinor, referralBps: p.referralBps, includesReview: p.includesReview };
    });
    const subtotal = lines.reduce((n, l) => n + l.unitPriceMinor * l.quantity, 0);
    const deliveryFee = this.deliveryFee(currency);
    const total = subtotal + deliveryFee;
    const referrerUserId = await this.referrer(input.referralCode, user.id);
    const referralShare = referrerUserId ? lines.reduce((n, l) => n + split(l.unitPriceMinor * l.quantity, l.unitSupplyCostMinor * l.quantity, l.referralBps).referral, 0) : 0;
    const supplierShare = lines.reduce((n, l) => n + l.unitSupplyCostMinor * l.quantity, 0) + deliveryFee;

    const order = await this.dataSource.transaction(async (manager) => {
      const wallet = await manager.getRepository(PatientWallet).findOne({ where: { userId: user.id, currency }, lock: { mode: 'pessimistic_write' } });
      const balance = wallet ? Number(wallet.balanceMinor) : 0;
      if (balance < total) {
        throw new HttpException({ message: 'Top up your wallet to pay for this order', error: 'TOP_UP_NEEDED', details: { code: 'TOP_UP_NEEDED', shortfallMinor: total - balance, totalMinor: total, balanceMinor: balance, currency } }, HttpStatus.PAYMENT_REQUIRED);
      }
      const repo = manager.getRepository(ShopOrder);
      const saved = await repo.save(repo.create({
        reference: orderReference(), userId: user.id, patientId: patient?.id ?? null, status: 'AWAITING_SUPPLIER', fulfilment: null, providerId: null,
        assignedAt: null, acceptBy: null, passedProviderIds: [], lines, currency, subtotalMinor: subtotal, deliveryFeeMinor: deliveryFee, totalMinor: total,
        supplierShareMinor: supplierShare, referralShareMinor: referralShare, referrerUserId, delivery, deliveryCode: String(randomInt(0, 10_000)).padStart(4, '0'),
        walletEntryId: null, includesReview: lines.some((l) => l.includesReview), deliveredAt: null, cancelledAt: null, cancelReason: null,
      }));
      const next = BigInt(wallet!.balanceMinor) - BigInt(total);
      wallet!.balanceMinor = next.toString();
      wallet!.version += 1;
      await manager.getRepository(PatientWallet).save(wallet!);
      const entry = await manager.getRepository(PatientWalletEntry).save(manager.getRepository(PatientWalletEntry).create({
        walletId: wallet!.id, direction: PatientWalletEntryDirection.DEBIT, type: PatientWalletEntryType.SHOP_PURCHASE, amountMinor: String(total),
        balanceAfterMinor: next.toString(), sourceReference: saved.reference, idempotencyKey: `SHOP:${saved.reference}`, metadata: { kind: 'SHOP_ORDER' },
      }));
      saved.walletEntryId = entry.id;
      await repo.save(saved);
      await this.event(manager, saved.id, 'PAID', null, user.id, null);
      await this.assign(manager, saved);
      return saved;
    });
    await this.notifyAssigned(order).catch(() => undefined);
    return this.buyerView(await this.withCode(order.id));
  }

  async myOrders(user: User) {
    const rows = await this.orders.createQueryBuilder('o').addSelect('o.deliveryCode').where('o.userId = :u', { u: user.id }).orderBy('o.createdAt', 'DESC').take(30).getMany();
    return { items: rows.map((o) => this.buyerView(o)) };
  }

  async myOrder(user: User, reference: string) {
    const o = await this.orders.createQueryBuilder('o').addSelect('o.deliveryCode').where('o.reference = :r AND o.userId = :u', { r: reference, u: user.id }).getOne();
    if (!o) throw new NotFoundException('Order not found');
    const history = await this.events.find({ where: { orderId: o.id }, order: { createdAt: 'ASC' } });
    const supplier = o.providerId && o.fulfilment === 'PHARMACY' ? await this.dataSource.query('SELECT display_name AS name, phone FROM providers WHERE id = $1', [o.providerId]).then((r) => r[0] ?? null) : null;
    return { ...this.buyerView(o), supplier: o.status === 'ACCEPTED' || o.status === 'OUT_FOR_DELIVERY' ? supplier : supplier ? { name: supplier.name, phone: null } : null, history: history.map((e) => ({ kind: e.kind, at: e.createdAt })) };
  }

  /** Cancel before a pharmacy has accepted it; the money goes straight back to the wallet. */
  async cancelMine(user: User, reference: string) {
    const o = await this.orders.findOne({ where: { reference, userId: user.id } });
    if (!o) throw new NotFoundException('Order not found');
    if (!['AWAITING_SUPPLIER', 'ASSIGNED'].includes(o.status)) throw new ConflictException('It’s already on its way. Contact support if you need to change it.');
    await this.dataSource.transaction((m) => this.cancel(m, o, 'Cancelled by you', user.id));
    return this.myOrder(user, reference);
  }

  // ---------- Pharmacies ----------

  async supplierView(user: User) {
    const { provider } = await this.current.resolveOperationalActor(user);
    const products = await this.products.find({ where: { active: true }, order: { sortOrder: 'ASC' } });
    const mine = new Map((await this.offers.find({ where: { providerId: provider.id } })).map((o) => [o.productId, o.active]));
    const orders = await this.orders.find({ where: { providerId: provider.id, status: In([...OPEN, 'DELIVERED']) }, order: { createdAt: 'DESC' }, take: 50 });
    return {
      eligible: provider.providerType === ProviderType.PHARMACY,
      products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, supplyCostMinor: p.supplyCostMinor, currency: p.currency, supplying: mine.get(p.id) === true })),
      deliveryFeeMinor: this.deliveryFee(CURRENCY[provider.countryCode ?? 'NG'] ?? 'NGN'),
      orders: orders.map((o) => this.supplierOrderView(o)),
    };
  }

  async setSupplying(user: User, productId: string, supplying: boolean) {
    const actor = await this.current.resolveOperationalActor(user);
    if (actor.provider.providerType !== ProviderType.PHARMACY) throw new ForbiddenException('Only pharmacies can supply shop orders');
    if (!(await this.products.exists({ where: { id: productId } }))) throw new NotFoundException('Product not found');
    await this.offers.save({ providerId: actor.provider.id, productId, active: supplying });
    // Orders waiting for a supplier may now have one.
    if (supplying) await this.retryWaiting().catch(() => undefined);
    return this.supplierView(user);
  }

  async supplierAction(user: User, reference: string, action: 'ACCEPT' | 'DECLINE' | 'DISPATCH' | 'DELIVER', input: { code?: string; reason?: string } = {}) {
    const { provider } = await this.current.resolveOperationalActor(user);
    const result = await this.dataSource.transaction(async (m) => {
      const o = await m.getRepository(ShopOrder).createQueryBuilder('o').addSelect('o.deliveryCode').setLock('pessimistic_write')
        .where('o.reference = :r AND o.providerId = :p', { r: reference, p: provider.id }).getOne();
      if (!o) throw new NotFoundException('Order not found');
      await this.applyAction(m, o, action, input, user.id, provider.id);
      return o;
    });
    await this.notifyBuyer(result).catch(() => undefined);
    if (action === 'DECLINE') await this.notifyAssigned(await this.orders.findOneByOrFail({ id: result.id })).catch(() => undefined);
    return this.supplierOrderView(result);
  }

  // ---------- Staff ----------

  async adminProducts() {
    const rows = await this.products.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    const suppliers: { productId: string; n: number }[] = await this.dataSource.query(`SELECT product_id AS "productId", COUNT(*)::int AS n FROM shop_supplier_offers WHERE active GROUP BY product_id`);
    return rows.map((p) => {
      const s = split(p.priceMinor, p.supplyCostMinor, p.referralBps);
      return { ...p, referralShareMinor: s.referral, marginMinor: s.margin, marginWithoutReferralMinor: s.margin + s.referral, suppliers: suppliers.find((x) => x.productId === p.id)?.n ?? 0 };
    });
  }

  async saveProduct(input: ProductInput, id?: string) {
    const sku = String(input.sku ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
    if (!sku) throw new BadRequestException('Add a product code (SKU)');
    if (!PRODUCT_CATEGORIES.includes(input.category)) throw new BadRequestException('Unknown category');
    const referralBps = Math.round(input.referralBps ?? 500);
    if (referralBps < 0 || referralBps > 3000) throw new BadRequestException('Referral share must be 0–30%');
    if (!(input.priceMinor > 0) || !(input.supplyCostMinor >= 0)) throw new BadRequestException('Set a price and a supply cost');
    if (split(input.priceMinor, input.supplyCostMinor, referralBps).margin < 0) throw new BadRequestException('The price doesn’t cover the supply cost and the referral share');
    const existing = id ? await this.products.findOne({ where: { id } }) : null;
    if (id && !existing) throw new NotFoundException('Product not found');
    const clash = await this.products.findOne({ where: { sku } });
    if (clash && clash.id !== id) throw new ConflictException('Another product has that code');
    const saved = await this.products.save({
      ...(existing ?? {}), sku, name: input.name.trim().slice(0, 140), brand: input.brand?.trim().slice(0, 60) || null, category: input.category,
      description: input.description.trim().slice(0, 1000), highlights: (input.highlights ?? []).map((h) => h.trim().slice(0, 120)).filter(Boolean).slice(0, 8),
      imageUrl: input.imageUrl?.trim() || null, validationNote: input.validationNote?.trim().slice(0, 160) || null, currency: (input.currency ?? existing?.currency ?? 'NGN').toUpperCase(),
      priceMinor: Math.round(input.priceMinor), supplyCostMinor: Math.round(input.supplyCostMinor), referralBps, includesReview: Boolean(input.includesReview),
      storeStock: Math.max(0, Math.round(input.storeStock ?? existing?.storeStock ?? 0)), active: Boolean(input.active), sortOrder: Math.round(input.sortOrder ?? existing?.sortOrder ?? 0),
    });
    if (saved.active) await this.retryWaiting().catch(() => undefined);
    return saved;
  }

  async adminOrders(status?: OrderStatus) {
    const qb = this.orders.createQueryBuilder('o').orderBy('o.createdAt', 'DESC').take(200);
    if (status) qb.where('o.status = :s', { s: status });
    const rows = await qb.getMany();
    const names = new Map<string, string>((await this.dataSource.query('SELECT id, display_name FROM providers WHERE id = ANY($1::uuid[])', [[...new Set(rows.map((r) => r.providerId).filter(Boolean))]])).map((r: { id: string; display_name: string }) => [r.id, r.display_name]));
    const [totals] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered, COUNT(*) FILTER (WHERE status IN ('AWAITING_SUPPLIER','ASSIGNED','ACCEPTED','OUT_FOR_DELIVERY'))::int AS open,
        COALESCE(SUM(total_minor) FILTER (WHERE status = 'DELIVERED'), 0)::bigint AS sales,
        COALESCE(SUM(total_minor - supplier_share_minor - referral_share_minor) FILTER (WHERE status = 'DELIVERED'), 0)::bigint AS margin,
        COALESCE(SUM(referral_share_minor) FILTER (WHERE status = 'DELIVERED'), 0)::bigint AS referrals
       FROM shop_orders`,
    );
    return {
      totals: { delivered: totals.delivered, open: totals.open, salesMinor: Number(totals.sales), marginMinor: Number(totals.margin), referralsMinor: Number(totals.referrals) },
      items: rows.map((o) => ({ ...this.supplierOrderView(o), supplierName: o.providerId ? names.get(o.providerId) ?? null : null, marginMinor: o.totalMinor - o.supplierShareMinor - o.referralShareMinor })),
    };
  }

  /** Staff: hand an order to a pharmacy or the store, move it on, or cancel (refund). */
  async adminAction(user: User, reference: string, action: 'ASSIGN_STORE' | 'ASSIGN_PROVIDER' | 'DISPATCH' | 'DELIVER' | 'CANCEL', input: { providerId?: string; code?: string; reason?: string } = {}) {
    const result = await this.dataSource.transaction(async (m) => {
      const o = await m.getRepository(ShopOrder).createQueryBuilder('o').addSelect('o.deliveryCode').setLock('pessimistic_write').where('o.reference = :r', { r: reference }).getOne();
      if (!o) throw new NotFoundException('Order not found');
      if (action === 'CANCEL') { await this.cancel(m, o, input.reason?.trim() || 'Cancelled by SmartClinic', user.id); return o; }
      if (action === 'ASSIGN_STORE' || action === 'ASSIGN_PROVIDER') {
        if (!['AWAITING_SUPPLIER', 'ASSIGNED'].includes(o.status)) throw new ConflictException('This order is already with a supplier');
        if (action === 'ASSIGN_STORE') {
          await this.takeStoreStock(m, o);
          Object.assign(o, { fulfilment: 'STORE', providerId: null, status: 'ACCEPTED', assignedAt: new Date(), acceptBy: null });
        } else {
          if (!input.providerId) throw new BadRequestException('Choose a pharmacy');
          Object.assign(o, { fulfilment: 'PHARMACY', providerId: input.providerId, status: 'ASSIGNED', assignedAt: new Date(), acceptBy: new Date(Date.now() + ACCEPT_HOURS * 3_600_000) });
        }
        await m.getRepository(ShopOrder).save(o);
        await this.event(m, o.id, action === 'ASSIGN_STORE' ? 'STORE' : 'ASSIGNED', null, user.id, o.providerId);
        return o;
      }
      if (o.fulfilment !== 'STORE') throw new ConflictException('Pharmacy orders are moved on by the pharmacy');
      await this.applyAction(m, o, action, input, user.id, null);
      return o;
    });
    await this.notifyBuyer(result).catch(() => undefined);
    if (action === 'ASSIGN_PROVIDER') await this.notifyAssigned(result).catch(() => undefined);
    return this.supplierOrderView(result);
  }

  // ---------- Internals ----------

  private async applyAction(m: EntityManager, o: ShopOrder, action: 'ACCEPT' | 'DECLINE' | 'DISPATCH' | 'DELIVER', input: { code?: string; reason?: string }, actorUserId: string, providerId: string | null) {
    const repo = m.getRepository(ShopOrder);
    if (action === 'ACCEPT') {
      if (o.status !== 'ASSIGNED') throw new ConflictException('This order can’t be accepted now');
      o.status = 'ACCEPTED';
      o.acceptBy = null;
    } else if (action === 'DECLINE') {
      if (o.status !== 'ASSIGNED') throw new ConflictException('Only a new order can be declined');
      o.passedProviderIds = [...new Set([...(o.passedProviderIds ?? []), o.providerId!])];
      await this.event(m, o.id, 'DECLINED', input.reason?.slice(0, 300) ?? null, actorUserId, providerId);
      Object.assign(o, { status: 'AWAITING_SUPPLIER', providerId: null, fulfilment: null, assignedAt: null, acceptBy: null });
      await repo.save(o);
      await this.assign(m, o);
      return;
    } else if (action === 'DISPATCH') {
      if (o.status !== 'ACCEPTED') throw new ConflictException('Accept the order first');
      o.status = 'OUT_FOR_DELIVERY';
    } else if (action === 'DELIVER') {
      if (o.status !== 'OUT_FOR_DELIVERY' && o.status !== 'ACCEPTED') throw new ConflictException('This order isn’t out for delivery');
      if (String(input.code ?? '').replace(/\D/g, '') !== o.deliveryCode) throw new BadRequestException('That delivery code isn’t right. Ask the customer for the 4-digit code in their SmartClinic app.');
      o.status = 'DELIVERED';
      o.deliveredAt = new Date();
      await repo.save(o);
      await this.event(m, o.id, 'DELIVERED', null, actorUserId, providerId);
      await this.settle(m, o);
      return;
    }
    await repo.save(o);
    await this.event(m, o.id, o.status, null, actorUserId, providerId);
  }

  /**
   * Find who supplies it: a pharmacy that stocks everything in the order, same city first, then
   * same state. If none, SmartClinic's store when it has stock. Otherwise it waits for staff.
   */
  private async assign(m: EntityManager, o: ShopOrder) {
    const productIds = o.lines.map((l) => l.productId);
    const passed = o.passedProviderIds?.length ? o.passedProviderIds : ['00000000-0000-0000-0000-000000000000'];
    const [best]: { id: string }[] = await m.query(
      `SELECT p.id FROM providers p
       WHERE p.provider_type = 'PHARMACY' AND p.status = 'ACTIVE' AND p.onboarding_status = 'APPROVED' AND p.deleted_at IS NULL
         AND p.country_code = $1 AND NOT (p.id = ANY($4::uuid[]))
         AND (SELECT COUNT(*) FROM shop_supplier_offers s WHERE s.provider_id = p.id AND s.active AND s.product_id = ANY($5::uuid[])) = $6
         AND (LOWER(p.state_or_region) = LOWER($2) OR LOWER(p.city) = LOWER($3))
       ORDER BY (LOWER(p.city) = LOWER($3)) DESC,
         (SELECT COUNT(*) FROM shop_orders x WHERE x.provider_id = p.id AND x.status IN ('ASSIGNED','ACCEPTED','OUT_FOR_DELIVERY')) ASC
       LIMIT 1`,
      [o.delivery.countryCode, o.delivery.stateOrRegion, o.delivery.city, passed, productIds, productIds.length],
    );
    if (best) {
      Object.assign(o, { fulfilment: 'PHARMACY', providerId: best.id, status: 'ASSIGNED', assignedAt: new Date(), acceptBy: new Date(Date.now() + ACCEPT_HOURS * 3_600_000) });
      await m.getRepository(ShopOrder).save(o);
      await this.event(m, o.id, 'ASSIGNED', null, null, best.id);
      return;
    }
    const inStore = await m.getRepository(ShopProduct).find({ where: { id: In(productIds) } });
    if (inStore.length === o.lines.length && o.lines.every((l) => (inStore.find((p) => p.id === l.productId)?.storeStock ?? 0) >= l.quantity)) {
      await this.takeStoreStock(m, o);
      Object.assign(o, { fulfilment: 'STORE', providerId: null, status: 'ACCEPTED', assignedAt: new Date(), acceptBy: null });
      await m.getRepository(ShopOrder).save(o);
      await this.event(m, o.id, 'STORE', null, null, null);
      return;
    }
    if (o.status !== 'AWAITING_SUPPLIER') { o.status = 'AWAITING_SUPPLIER'; await m.getRepository(ShopOrder).save(o); }
    await this.event(m, o.id, 'WAITING', 'No nearby pharmacy stocks this yet', null, null);
  }

  private async takeStoreStock(m: EntityManager, o: ShopOrder) {
    for (const l of o.lines) {
      const r = await m.query(`UPDATE shop_products SET store_stock = store_stock - $2 WHERE id = $1 AND store_stock >= $2`, [l.productId, l.quantity]);
      if (Array.isArray(r) && r[1] === 0) throw new ConflictException(`Not enough ${l.name} in the store`);
    }
  }

  /** Pharmacies that didn't accept in time pass it to the next one. Runs every 15 minutes. */
  async reassignOverdue(now = new Date()): Promise<number> {
    const overdue = await this.orders.createQueryBuilder('o').where('o.status = :s AND o.acceptBy < :now', { s: 'ASSIGNED', now }).take(100).getMany();
    for (const o of overdue) {
      await this.dataSource.transaction(async (m) => {
        const locked = await m.getRepository(ShopOrder).findOne({ where: { id: o.id }, lock: { mode: 'pessimistic_write' } });
        if (!locked || locked.status !== 'ASSIGNED') return;
        locked.passedProviderIds = [...new Set([...(locked.passedProviderIds ?? []), locked.providerId!])];
        await this.event(m, locked.id, 'TIMED_OUT', `Not accepted within ${ACCEPT_HOURS} hours`, null, locked.providerId);
        Object.assign(locked, { status: 'AWAITING_SUPPLIER', providerId: null, fulfilment: null, assignedAt: null, acceptBy: null });
        await m.getRepository(ShopOrder).save(locked);
        await this.assign(m, locked);
      });
      await this.notifyAssigned(await this.orders.findOneByOrFail({ id: o.id })).catch(() => undefined);
    }
    await this.retryWaiting().catch(() => undefined);
    return overdue.length;
  }

  private async retryWaiting() {
    const waiting = await this.orders.find({ where: { status: 'AWAITING_SUPPLIER' }, take: 50 });
    for (const o of waiting) {
      const updated = await this.dataSource.transaction(async (m) => {
        const locked = await m.getRepository(ShopOrder).findOne({ where: { id: o.id }, lock: { mode: 'pessimistic_write' } });
        if (!locked || locked.status !== 'AWAITING_SUPPLIER') return null;
        const before = locked.providerId;
        await this.assign(m, locked);
        return locked.providerId !== before ? locked : null;
      });
      if (updated) await this.notifyAssigned(updated).catch(() => undefined);
    }
  }

  /** Refund to the wallet and cancel. */
  private async cancel(m: EntityManager, o: ShopOrder, reason: string, actorUserId: string | null) {
    if (o.status === 'DELIVERED' || o.status === 'CANCELLED') throw new ConflictException('This order is already finished');
    if (o.fulfilment === 'STORE') for (const l of o.lines) await m.query(`UPDATE shop_products SET store_stock = store_stock + $2 WHERE id = $1`, [l.productId, l.quantity]);
    const wallet = await m.getRepository(PatientWallet).findOne({ where: { userId: o.userId, currency: o.currency }, lock: { mode: 'pessimistic_write' } });
    const key = `SHOP-REFUND:${o.reference}`;
    if (wallet && !(await m.getRepository(PatientWalletEntry).exists({ where: { idempotencyKey: key } }))) {
      const next = BigInt(wallet.balanceMinor) + BigInt(o.totalMinor);
      wallet.balanceMinor = next.toString();
      wallet.version += 1;
      await m.getRepository(PatientWallet).save(wallet);
      await m.getRepository(PatientWalletEntry).save(m.getRepository(PatientWalletEntry).create({
        walletId: wallet.id, direction: PatientWalletEntryDirection.CREDIT, type: PatientWalletEntryType.REFUND, amountMinor: String(o.totalMinor),
        balanceAfterMinor: next.toString(), sourceReference: o.reference, idempotencyKey: key, metadata: { kind: 'SHOP_ORDER_REFUND' },
      }));
    }
    Object.assign(o, { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason.slice(0, 300), acceptBy: null });
    await m.getRepository(ShopOrder).save(o);
    await this.event(m, o.id, 'CANCELLED', reason.slice(0, 300), actorUserId, null);
  }

  /**
   * Delivered: pay the pharmacy (cost + delivery) through normal payouts, and credit the referrer's
   * share as cash-backed referral points they can withdraw.
   */
  private async settle(m: EntityManager, o: ShopOrder) {
    if (o.fulfilment === 'PHARMACY' && o.providerId) {
      const repo = m.getRepository(ProviderEarning);
      if (!(await repo.exists({ where: { sourceType: ProviderEarningSourceType.SHOP_ORDER, sourceReference: o.reference } }))) {
        const commission = o.totalMinor - o.supplierShareMinor;
        const earning = await repo.save(repo.create({
          providerId: o.providerId, paymentTransactionId: null, sourceType: ProviderEarningSourceType.SHOP_ORDER, sourceReference: o.reference, currency: o.currency,
          grossAmountMinor: String(o.totalMinor), commissionBps: Math.round((commission * 10_000) / o.totalMinor), commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
          commissionAmountMinor: String(commission), referralShareMinor: '0', providerShareMinor: String(o.supplierShareMinor),
          status: ProviderEarningStatus.PAYABLE, payableAt: new Date(), settledAt: null,
        }));
        await m.getRepository(ProviderEarningStatusHistory).save({ providerEarningId: earning.id, fromStatus: null, toStatus: ProviderEarningStatus.PAYABLE, actorUserId: null, reasonCode: 'SHOP_ORDER_DELIVERED', reasonNote: 'Delivered with the customer’s code' });
      }
    }
    if (o.referrerUserId && o.referralShareMinor > 0) {
      const [rate] = await m.query(`SELECT points, amount FROM reward_conversion_rates WHERE is_active AND currency = $1 LIMIT 1`, [o.currency]);
      const rateMinor = rate ? Math.round(Number(rate.amount) * 100) : 0;
      const points = rate && rateMinor > 0 ? Math.floor((o.referralShareMinor * Number(rate.points)) / rateMinor) : 0;
      if (points > 0) {
        const key = `shop-referral:${o.reference}`;
        const ledger = m.getRepository(RewardPointsLedger);
        if (!(await ledger.exists({ where: { eventKey: key } }))) {
          await ledger.save(ledger.create({ userId: o.referrerUserId, referralId: null, eventKey: key, eventType: 'SHOP_REFERRAL', direction: RewardLedgerDirection.CREDIT, points, reasonCode: 'SHOP_REFERRAL' }));
        }
      } else {
        this.logger.warn('No reward conversion rate: shop referral share not credited');
      }
    }
  }

  /** Whose referral code: never yourself, and never a provider account (doctors may not take commissions on what they recommend). */
  private async referrer(code: string | null | undefined, buyerUserId: string): Promise<string | null> {
    const normalized = String(code ?? '').trim().toUpperCase();
    if (!/^SC-[A-F0-9]{6}$/.test(normalized)) return null;
    const [row] = await this.dataSource.query(
      `SELECT r.user_id AS "userId", u.roles FROM referral_codes r JOIN users u ON u.id = r.user_id WHERE r.code_normalized = $1 AND r.is_active AND u.deleted_at IS NULL`,
      [normalized],
    );
    if (!row || row.userId === buyerUserId) return null;
    const roles: string[] = Array.isArray(row.roles) ? row.roles : String(row.roles ?? '').replace(/[{}]/g, '').split(',');
    if (roles.includes(UserRole.PROVIDER) || roles.includes(UserRole.ADMIN) || roles.includes(UserRole.OPERATIONS)) return null;
    return row.userId;
  }

  private deliveryFee(currency: string): number {
    return feeFor(this.config?.get<string>('SHOP_DELIVERY_FEE') ?? 'NGN:1500', currency);
  }

  private cleanDelivery(d: DeliveryDetails): DeliveryDetails {
    const countryCode = String(d?.countryCode ?? 'NG').toUpperCase();
    const phone = normalizePhone(countryCode, d?.phone);
    const clean = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const out = { name: clean(d?.name, 120), phone: phone ?? '', address: clean(d?.address, 300), city: clean(d?.city, 120), stateOrRegion: clean(d?.stateOrRegion, 120), countryCode, notes: clean(d?.notes, 300) || null };
    if (!out.name || !out.address || !out.city || !out.stateOrRegion) throw new BadRequestException('Add the name, address, city and state for delivery');
    if (!phone) throw new BadRequestException('Add a phone number the rider can call');
    return out;
  }

  private async withCode(id: string) {
    return this.orders.createQueryBuilder('o').addSelect('o.deliveryCode').where('o.id = :id', { id }).getOneOrFail();
  }

  private buyerView(o: ShopOrder) {
    const showCode = ['ASSIGNED', 'ACCEPTED', 'OUT_FOR_DELIVERY'].includes(o.status);
    return {
      reference: o.reference, status: o.status, createdAt: o.createdAt, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt, cancelReason: o.cancelReason,
      lines: o.lines.map((l) => ({ sku: l.sku, name: l.name, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor })),
      currency: o.currency, subtotalMinor: o.subtotalMinor, deliveryFeeMinor: o.deliveryFeeMinor, totalMinor: o.totalMinor,
      delivery: o.delivery, deliveryCode: showCode ? o.deliveryCode ?? null : null, includesReview: o.includesReview,
      canCancel: ['AWAITING_SUPPLIER', 'ASSIGNED'].includes(o.status),
    };
  }

  private supplierOrderView(o: ShopOrder) {
    const shareContact = ['ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status);
    return {
      reference: o.reference, status: o.status, fulfilment: o.fulfilment, createdAt: o.createdAt, acceptBy: o.acceptBy, deliveredAt: o.deliveredAt,
      lines: o.lines.map((l) => ({ name: l.name, quantity: l.quantity })),
      area: `${o.delivery.city}, ${o.delivery.stateOrRegion}`,
      // Name, phone and address only once they've accepted it.
      delivery: shareContact ? o.delivery : null,
      youGetMinor: o.supplierShareMinor, currency: o.currency, totalMinor: o.totalMinor,
    };
  }

  private async event(m: EntityManager, orderId: string, kind: string, note: string | null, actorUserId: string | null, providerId: string | null) {
    await m.getRepository(ShopOrderEvent).insert({ orderId, kind, note, actorUserId, providerId });
  }

  private async notifyAssigned(o: ShopOrder) {
    if (!this.notifications || o.status !== 'ASSIGNED' || !o.providerId) return;
    await this.dataSource.transaction((m) => this.notifications!.createForProviderTransactional(m, o.providerId, {
      type: NotificationType.SHOP_ORDER_UPDATE, title: 'New SmartClinic order to supply',
      message: `${o.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')} for delivery in ${o.delivery.city}. Accept within ${ACCEPT_HOURS} hours.`,
      entityType: NotificationEntityType.WELLNESS, entityReference: o.reference, metadata: { route: '/provider/shop', kind: 'shopOrder' },
      idempotencyKey: `shop-assigned:${o.reference}:${o.providerId}`, email: { enabled: true },
    }));
  }

  private async notifyBuyer(o: ShopOrder) {
    if (!this.notifications) return;
    const text: Partial<Record<OrderStatus, string>> = {
      ACCEPTED: 'A pharmacy near you has your order and is getting it ready.',
      OUT_FOR_DELIVERY: 'Your order is on its way. Have your 4-digit delivery code ready.',
      DELIVERED: 'Delivered. Take your first readings today and add them to your check-up.',
      CANCELLED: 'Your order was cancelled and the money is back in your wallet.',
    };
    const message = text[o.status];
    if (!message) return;
    await this.dataSource.transaction((m) => this.notifications!.createTransactionalNotification(m, {
      userId: o.userId, type: NotificationType.SHOP_ORDER_UPDATE, title: `Order ${o.reference}`, message,
      entityType: NotificationEntityType.WELLNESS, entityReference: o.reference, metadata: { route: `/me/orders/${o.reference}`, kind: 'shopOrder' },
      idempotencyKey: `shop-order:${o.reference}:${o.status}`, email: { enabled: o.status !== 'ACCEPTED' },
    }));
  }
}
