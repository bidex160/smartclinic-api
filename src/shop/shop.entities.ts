import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ProductCategory = 'BP_MONITOR' | 'GLUCOMETER' | 'TEST_STRIPS' | 'SCALE' | 'THERMOMETER' | 'OTHER';
export const PRODUCT_CATEGORIES: readonly ProductCategory[] = ['BP_MONITOR', 'GLUCOMETER', 'TEST_STRIPS', 'SCALE', 'THERMOMETER', 'OTHER'];

/**
 * Something patients can buy: home monitors first. The price includes the cost of service:
 * the supplier's cost, the referral share (a % of the price, paid to whoever referred the buyer)
 * and SmartClinic's margin. Patients see one price.
 */
@Entity('shop_products')
@Index('UQ_shop_products_sku', ['sku'], { unique: true })
export class ShopProduct {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40 }) sku!: string;
  @Column({ type: 'varchar', length: 140 }) name!: string;
  @Column({ type: 'varchar', length: 60, nullable: true }) brand!: string | null;
  @Column({ type: 'varchar', length: 16 }) category!: ProductCategory;
  @Column({ type: 'varchar', length: 1000 }) description!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) highlights!: string[];
  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true }) imageUrl!: string | null;
  /** e.g. "Clinically validated (STRIDE BP list)". Only validated monitors should be sold. */
  @Column({ name: 'validation_note', type: 'varchar', length: 160, nullable: true }) validationNote!: string | null;
  @Column({ type: 'char', length: 3, default: 'NGN' }) currency!: string;
  @Column({ name: 'price_minor', type: 'integer' }) priceMinor!: number;
  /** What a supplying pharmacy is paid for one (or what our own stock costs us). */
  @Column({ name: 'supply_cost_minor', type: 'integer' }) supplyCostMinor!: number;
  /** Share of the price paid to the person who referred the buyer, in basis points (500 = 5%). */
  @Column({ name: 'referral_bps', type: 'smallint', default: 500 }) referralBps!: number;
  /** Comes with a free doctor review of the first week's readings. */
  @Column({ name: 'includes_review', type: 'boolean', default: false }) includesReview!: boolean;
  /** Units in SmartClinic's own store (0 = we don't hold any; pharmacies supply). */
  @Column({ name: 'store_stock', type: 'integer', default: 0 }) storeStock!: number;
  @Column({ type: 'boolean', default: false }) active!: boolean;
  @Column({ name: 'sort_order', type: 'smallint', default: 0 }) sortOrder!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/** A pharmacy that can supply and deliver a product near it. */
@Entity('shop_supplier_offers')
export class ShopSupplierOffer {
  @PrimaryColumn({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @PrimaryColumn({ name: 'product_id', type: 'uuid' }) productId!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

export type OrderStatus = 'AWAITING_SUPPLIER' | 'ASSIGNED' | 'ACCEPTED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type Fulfilment = 'PHARMACY' | 'STORE';

export interface OrderLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  unitSupplyCostMinor: number;
  referralBps: number;
  includesReview: boolean;
}

export interface DeliveryDetails {
  name: string;
  phone: string;
  address: string;
  city: string;
  stateOrRegion: string;
  countryCode: string;
  notes: string | null;
}

/**
 * An order, paid from the patient's SmartClinic wallet. A nearby pharmacy that stocks it gets it
 * (or SmartClinic's own store), delivers it, and confirms with the 4-digit code the patient gives.
 * The money split is fixed when it's paid: supplier (cost + delivery), referrer (share of the
 * price), SmartClinic (the rest).
 */
@Entity('shop_orders')
@Index('UQ_shop_orders_reference', ['reference'], { unique: true })
@Index('IDX_shop_orders_user_created', ['userId', 'createdAt'])
@Index('IDX_shop_orders_provider_status', ['providerId', 'status'])
export class ShopOrder {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 20 }) reference!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'patient_id', type: 'uuid', nullable: true }) patientId!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: OrderStatus;
  @Column({ type: 'varchar', length: 10, nullable: true }) fulfilment!: Fulfilment | null;
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId!: string | null;
  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true }) assignedAt!: Date | null;
  @Column({ name: 'accept_by', type: 'timestamptz', nullable: true }) acceptBy!: Date | null;
  /** Pharmacies that declined or didn't answer in time; not offered it again. */
  @Column({ name: 'passed_provider_ids', type: 'jsonb', default: () => "'[]'::jsonb" }) passedProviderIds!: string[];
  @Column({ type: 'jsonb' }) lines!: OrderLine[];
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'subtotal_minor', type: 'integer' }) subtotalMinor!: number;
  @Column({ name: 'delivery_fee_minor', type: 'integer' }) deliveryFeeMinor!: number;
  @Column({ name: 'total_minor', type: 'integer' }) totalMinor!: number;
  /** Supplier's share: their cost for the items plus the delivery fee. */
  @Column({ name: 'supplier_share_minor', type: 'integer' }) supplierShareMinor!: number;
  @Column({ name: 'referral_share_minor', type: 'integer', default: 0 }) referralShareMinor!: number;
  @Column({ name: 'referrer_user_id', type: 'uuid', nullable: true }) referrerUserId!: string | null;
  @Column({ type: 'jsonb' }) delivery!: DeliveryDetails;
  /** 4-digit handover code: shown to the buyer only; the pharmacy enters it on delivery. */
  @Column({ name: 'delivery_code', type: 'varchar', length: 4, select: false }) deliveryCode?: string;
  @Column({ name: 'wallet_entry_id', type: 'uuid', nullable: true }) walletEntryId!: string | null;
  @Column({ name: 'includes_review', type: 'boolean', default: false }) includesReview!: boolean;
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt!: Date | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt!: Date | null;
  @Column({ name: 'cancel_reason', type: 'varchar', length: 300, nullable: true }) cancelReason!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('shop_order_events')
@Index('IDX_shop_order_events_order', ['orderId', 'createdAt'])
export class ShopOrderEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'order_id', type: 'uuid' }) orderId!: string;
  @Column({ type: 'varchar', length: 30 }) kind!: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) note!: string | null;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/** "Free doctor review" that comes with a Home Heart Kit, once there's a week of readings. */
@Entity('checkup_review_requests')
@Index('IDX_checkup_review_requests_status', ['status', 'createdAt'])
export class CheckupReviewRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId!: string | null;
  @Column({ type: 'varchar', length: 12 }) status!: 'REQUESTED' | 'ANSWERED';
  @Column({ name: 'patient_note', type: 'varchar', length: 500, nullable: true }) patientNote!: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) answer!: string | null;
  @Column({ name: 'answered_by_user_id', type: 'uuid', nullable: true }) answeredByUserId!: string | null;
  @Column({ name: 'answered_at', type: 'timestamptz', nullable: true }) answeredAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
