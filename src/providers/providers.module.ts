import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProviderAssignmentHistory } from './entities/provider-assignment-history.entity';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { Provider } from './entities/provider.entity';
import { AuthModule } from '../auth/auth.module';
import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { AdminProviderCapabilitiesController } from './admin-provider-capabilities.controller';
import { AdminProviderLocationsController } from './admin-provider-locations.controller';
import { ProviderLocation } from './entities/provider-location.entity';
import { ProviderServiceLocation } from './entities/provider-service-location.entity';
import { ProviderService } from './entities/provider-service.entity';
import { ProviderCapabilitiesService } from './provider-capabilities.service';
import { AdminProviderAvailabilityController } from './admin-provider-availability.controller';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { ProviderAvailabilityService } from './provider-availability.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Provider, ProviderAssignment, ProviderAssignmentHistory, ProviderService, ProviderLocation, ProviderServiceLocation, ProviderAvailability, HealthCheckPackage, FulfilmentMode])],
  controllers: [AdminProviderCapabilitiesController, AdminProviderLocationsController, AdminProviderAvailabilityController],
  providers: [ProviderCapabilitiesService, ProviderAvailabilityService],
  exports: [ProviderCapabilitiesService, ProviderAvailabilityService],
})
export class ProvidersModule {}
