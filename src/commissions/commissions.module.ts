import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Provider } from '../providers/entities/provider.entity';
import { AdminPlatformCommissionController, AdminProviderCommissionController } from './admin-commission.controller';
import { AdminCommissionService } from './admin-commission.service';
import { CommissionResolutionService } from './commission-resolution.service';
import { CommissionConfigHistory } from './entities/commission-config-history.entity';
import { PlatformCommissionSetting } from './entities/platform-commission-setting.entity';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([Provider, PlatformCommissionSetting, CommissionConfigHistory])], controllers: [AdminPlatformCommissionController, AdminProviderCommissionController], providers: [AdminCommissionService, CommissionResolutionService], exports: [CommissionResolutionService] })
export class CommissionsModule {}
