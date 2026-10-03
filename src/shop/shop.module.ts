import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CheckupsModule } from '../checkups/checkups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Patient } from '../patients/entities/patient.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderMember } from '../providers/entities/provider-member.entity';
import { Provider } from '../providers/entities/provider.entity';
import { ReadingsReviewService } from './readings-review.service';
import { AdminShopController, MeShopController, ProviderShopController, PublicShopController } from './shop.controller';
import { CheckupReviewRequest, ShopOrder, ShopOrderEvent, ShopProduct, ShopSupplierOffer } from './shop.entities';
import { ShopService } from './shop.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    CheckupsModule,
    TypeOrmModule.forFeature([ShopProduct, ShopSupplierOffer, ShopOrder, ShopOrderEvent, CheckupReviewRequest, Patient, Provider, ProviderMember]),
  ],
  controllers: [PublicShopController, MeShopController, ProviderShopController, AdminShopController],
  providers: [ShopService, ReadingsReviewService, CurrentProviderService],
})
export class ShopModule {}
