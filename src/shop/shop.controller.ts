import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { ReadingsReviewService } from './readings-review.service';
import { OrderStatus, PRODUCT_CATEGORIES, ProductCategory } from './shop.entities';
import { ShopService } from './shop.service';

export class CatalogueQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_CATEGORIES }) @IsOptional() @IsIn(PRODUCT_CATEGORIES as unknown as string[]) category?: ProductCategory;
  @ApiPropertyOptional({ example: 'NGN' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
}

export class BasketItemDto {
  @ApiProperty({ example: 'BP-BASIC' }) @IsString() @MaxLength(40) sku!: string;
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(5) quantity!: number;
}

export class DeliveryDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MaxLength(30) phone!: string;
  @ApiProperty() @IsString() @MaxLength(300) address!: string;
  @ApiProperty() @IsString() @MaxLength(120) city!: string;
  @ApiProperty() @IsString() @MaxLength(120) stateOrRegion!: string;
  @ApiProperty({ example: 'NG' }) @Matches(/^[A-Za-z]{2}$/) countryCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) notes?: string | null;
}

export class CheckoutDto {
  @ApiProperty({ type: [BasketItemDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => BasketItemDto) items!: BasketItemDto[];
  @ApiProperty({ type: DeliveryDto }) @ValidateNested() @Type(() => DeliveryDto) delivery!: DeliveryDto;
  @ApiPropertyOptional({ example: 'SC-1A2B3C', description: 'Referral code of the person who recommended it' }) @IsOptional() @IsString() @MaxLength(12) referralCode?: string;
}

export class SupplyDto {
  @ApiProperty() @IsBoolean() supplying!: boolean;
}

export class SupplierActionDto {
  @ApiProperty({ enum: ['ACCEPT', 'DECLINE', 'DISPATCH', 'DELIVER'] }) @IsIn(['ACCEPT', 'DECLINE', 'DISPATCH', 'DELIVER']) action!: 'ACCEPT' | 'DECLINE' | 'DISPATCH' | 'DELIVER';
  @ApiPropertyOptional({ description: 'The 4-digit code from the customer (to deliver)' }) @IsOptional() @Matches(/^\d{4}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class AdminOrderActionDto {
  @ApiProperty({ enum: ['ASSIGN_STORE', 'ASSIGN_PROVIDER', 'DISPATCH', 'DELIVER', 'CANCEL'] }) @IsIn(['ASSIGN_STORE', 'ASSIGN_PROVIDER', 'DISPATCH', 'DELIVER', 'CANCEL'])
  action!: 'ASSIGN_STORE' | 'ASSIGN_PROVIDER' | 'DISPATCH' | 'DELIVER' | 'CANCEL';
  @ApiPropertyOptional() @IsOptional() @IsUUID() providerId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class ProductDto {
  @ApiProperty({ example: 'BP-BASIC' }) @IsString() @MaxLength(40) sku!: string;
  @ApiProperty() @IsString() @MaxLength(140) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) brand?: string | null;
  @ApiProperty({ enum: PRODUCT_CATEGORIES }) @IsIn(PRODUCT_CATEGORIES as unknown as string[]) category!: ProductCategory;
  @ApiProperty() @IsString() @MaxLength(1000) description!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(120, { each: true }) highlights?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) imageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) validationNote?: string | null;
  @ApiPropertyOptional({ example: 'NGN' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiProperty({ example: 3200000 }) @Type(() => Number) @IsInt() @Min(1) priceMinor!: number;
  @ApiProperty({ example: 2400000 }) @Type(() => Number) @IsInt() @Min(0) supplyCostMinor!: number;
  @ApiPropertyOptional({ example: 500, description: 'Referral share in basis points (500 = 5%)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3000) referralBps?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includesReview?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) storeStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class ReviewRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReviewAnswerDto {
  @ApiProperty() @IsString() @MaxLength(2000) answer!: string;
}

@ApiTags('Shop')
@Controller('shop')
export class PublicShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('products')
  @ApiOperation({ summary: 'Home monitors and refills for sale' })
  list(@Query() q: CatalogueQueryDto) {
    return this.shop.catalogue(q.category, q.currency ?? 'NGN');
  }

  @Get('products/:sku')
  one(@Param('sku') sku: string) {
    return this.shop.product(sku);
  }
}

@ApiTags('Shop')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me')
export class MeShopController {
  constructor(private readonly shop: ShopService, private readonly reviews: ReadingsReviewService) {}

  @Post('shop/orders')
  @ApiOperation({ summary: 'Buy, paying from the wallet. 402 TOP_UP_NEEDED with the shortfall if the wallet is short.' })
  checkout(@Req() r: { user: User }, @Body() dto: CheckoutDto) {
    return this.shop.checkout(r.user, { items: dto.items, delivery: { ...dto.delivery, notes: dto.delivery.notes ?? null }, referralCode: dto.referralCode });
  }

  @Get('shop/orders')
  orders(@Req() r: { user: User }) {
    return this.shop.myOrders(r.user);
  }

  @Get('shop/orders/:reference')
  order(@Req() r: { user: User }, @Param('reference') reference: string) {
    return this.shop.myOrder(r.user, reference);
  }

  @Post('shop/orders/:reference/cancel')
  cancel(@Req() r: { user: User }, @Param('reference') reference: string) {
    return this.shop.cancelMine(r.user, reference);
  }

  @Get('checkup/review')
  @ApiOperation({ summary: 'The free doctor review that comes with a Home Heart Kit' })
  review(@Req() r: { user: User }) {
    return this.reviews.mine(r.user);
  }

  @Post('checkup/review')
  requestReview(@Req() r: { user: User }, @Body() dto: ReviewRequestDto) {
    return this.reviews.request(r.user, dto.note);
  }
}

@ApiTags('Shop')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/shop')
export class ProviderShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  @ApiOperation({ summary: 'Products we can supply, and orders sent to us' })
  view(@Req() r: { user: User }) {
    return this.shop.supplierView(r.user);
  }

  @Put('products/:productId')
  supply(@Req() r: { user: User }, @Param('productId', ParseUUIDPipe) productId: string, @Body() dto: SupplyDto) {
    return this.shop.setSupplying(r.user, productId, dto.supplying);
  }

  @Post('orders/:reference')
  @ApiOperation({ summary: 'Accept, decline, mark on the way, or delivered (with the customer’s 4-digit code)' })
  act(@Req() r: { user: User }, @Param('reference') reference: string, @Body() dto: SupplierActionDto) {
    return this.shop.supplierAction(r.user, reference, dto.action, dto);
  }
}

@ApiTags('Shop')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATIONS)
@Controller('admin')
export class AdminShopController {
  constructor(private readonly shop: ShopService, private readonly reviews: ReadingsReviewService) {}

  @Get('shop/products')
  products() {
    return this.shop.adminProducts();
  }

  @Post('shop/products')
  create(@Body() dto: ProductDto) {
    return this.shop.saveProduct(dto);
  }

  @Patch('shop/products/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProductDto) {
    return this.shop.saveProduct(dto, id);
  }

  @Get('shop/orders')
  orders(@Query('status') status?: OrderStatus) {
    return this.shop.adminOrders(status);
  }

  @Post('shop/orders/:reference')
  act(@Req() r: { user: User }, @Param('reference') reference: string, @Body() dto: AdminOrderActionDto) {
    return this.shop.adminAction(r.user, reference, dto.action, dto);
  }

  @Get('checkups/reviews')
  @ApiOperation({ summary: 'Home readings waiting for a clinician’s free review' })
  queue() {
    return this.reviews.queue();
  }

  @Post('checkups/reviews/:id')
  answer(@Req() r: { user: User }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewAnswerDto) {
    return this.reviews.answer(r.user, id, dto.answer);
  }
}
