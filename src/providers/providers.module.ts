import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ProviderAssignmentHistory } from "./entities/provider-assignment-history.entity";
import { ProviderAssignment } from "./entities/provider-assignment.entity";
import { Provider } from "./entities/provider.entity";
import { AuthModule } from "../auth/auth.module";
import { FulfilmentMode } from "../health-checks/entities/fulfilment-mode.entity";
import { HealthCheckPackage } from "../health-checks/entities/health-check-package.entity";
import { AdminProviderCapabilitiesController } from "./admin-provider-capabilities.controller";
import { AdminProviderLocationsController } from "./admin-provider-locations.controller";
import { ProviderLocation } from "./entities/provider-location.entity";
import { ProviderServiceLocation } from "./entities/provider-service-location.entity";
import { ProviderService } from "./entities/provider-service.entity";
import { ProviderCapabilitiesService } from "./provider-capabilities.service";
import { AdminProviderAvailabilityController } from "./admin-provider-availability.controller";
import { ProviderAvailability } from "./entities/provider-availability.entity";
import { ProviderAvailabilityService } from "./provider-availability.service";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingStatusHistory } from "../bookings/entities/booking-status-history.entity";
import { AdminProviderMatchingController } from "./admin-provider-matching.controller";
import { ProviderMatchingService } from "./provider-matching.service";
import { CurrentProviderService } from "./current-provider.service";
import { ProviderOffersController } from "./provider-offers.controller";
import { ProviderOffersService } from "./provider-offers.service";
import { AdminProviderAssignmentsService } from "./admin-provider-assignments.service";
import { ProviderAvailabilityException } from "./entities/provider-availability-exception.entity";
import { ProviderAvailabilityExceptionsService } from "./provider-availability-exceptions.service";
import { AdminProviderAvailabilityExceptionsController } from "./admin-provider-availability-exceptions.controller";
import { ProviderBookingReservation } from "./entities/provider-booking-reservation.entity";
import { BookingFunding } from "../bookings/entities/booking-funding.entity";
import { AdminMatchingQueueService } from "./admin-matching-queue.service";
import { PaymentAttempt } from "../payments/entities/payment-attempt.entity";
import { PaymentTransaction } from "../payments/entities/payment-transaction.entity";
import { AdminBookingDetailService } from "./admin-booking-detail.service";
import { User } from "../users/entities/user.entity";
import { AdminProvidersService } from "./admin-providers.service";
import { AdminProvidersController } from "./admin-providers.controller";
import { ProviderInvitation } from "./entities/provider-invitation.entity";
import { UserCredential } from "../users/entities/user-credential.entity";
import { ProviderInvitationsService } from "./provider-invitations.service";
import { AdminProviderInvitationsController } from "./admin-provider-invitations.controller";
import { PublicProviderInvitationsController } from "./public-provider-invitations.controller";
import { EmailModule } from "../notifications/email/email.module";
import { AdminBookingSchedulingController } from "./admin-booking-scheduling.controller";
import { AdminBookingSchedulingService } from "./admin-booking-scheduling.service";
import { ProviderOnboardingService } from "./provider-onboarding.service";
import { ProviderOnboardingController } from "./provider-onboarding.controller";
import { PublicProviderRegistrationController } from "./public-provider-registration.controller";
import { ProviderConfigurationContextService } from "./provider-configuration-context.service";
import { ProviderOnboardingReadinessService } from "./provider-onboarding-readiness.service";
import { ProviderSelfServiceConfigurationController } from "./provider-self-service-configuration.controller";
import { ProviderSelfServiceConfigurationService } from "./provider-self-service-configuration.service";
import { ProviderServiceArea } from "./entities/provider-service-area.entity";
import { ProviderServiceAreasService } from "./provider-service-areas.service";
import { BookingVisitAddress } from "../bookings/entities/booking-visit-address.entity";
import { HealthCheckEncounter } from "../health-checks/entities/health-check-encounter.entity";
import { ProviderDashboardController } from "./provider-dashboard.controller";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { ProviderDashboardService } from "./provider-dashboard.service";
import { AdminDashboardService } from "./admin-dashboard.service";
import { RewardsModule } from '../rewards/rewards.module';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { ProviderCareServiceDeliveryOption } from './entities/provider-care-service-delivery-option.entity';
import { ProviderCareServiceClinicalTemplate } from './entities/provider-care-service-clinical-template.entity';
import { AdminCareServicesController, ProviderCareServicesController, PublicFindCareController } from './provider-care-services.controller';
import { ProviderCareServicesService } from './provider-care-services.service';
import { FindCareService } from './find-care.service';
import { ProviderCareEligibilityService } from './provider-care-eligibility.service';
import { ProviderServiceAddon } from './entities/provider-service-addon.entity';
import { HealthCheckAddon } from '../health-checks/entities/health-check-addon.entity';
import { HealthCheckPackageAddon } from '../health-checks/entities/health-check-package-addon.entity';
@Module({
  imports: [
    AuthModule,
    EmailModule,
    RewardsModule,
    TypeOrmModule.forFeature([
      Provider,
      ProviderAssignment,
      ProviderAssignmentHistory,
      ProviderService,
      ProviderServiceArea,
      ProviderLocation,
      ProviderServiceLocation,
      ProviderAvailability,
      ProviderAvailabilityException,
      ProviderBookingReservation,
      ProviderInvitation,
      HealthCheckPackage,
      FulfilmentMode,
      Booking,
      BookingVisitAddress,
      HealthCheckEncounter,
      BookingFunding,
      BookingStatusHistory,
      PaymentAttempt,
      PaymentTransaction,
      User,
      UserCredential,
      CareServiceDefinition,
      ProviderCareService,
      ProviderCareServiceDeliveryOption,
      ProviderCareServiceClinicalTemplate,
      ProviderServiceAddon,
      HealthCheckAddon,
      HealthCheckPackageAddon,
    ]),
  ],
  controllers: [
    AdminProvidersController,
    AdminProviderInvitationsController,
    PublicProviderInvitationsController,
    PublicProviderRegistrationController,
    ProviderOnboardingController,
    ProviderSelfServiceConfigurationController,
    AdminProviderCapabilitiesController,
    AdminProviderLocationsController,
    AdminProviderAvailabilityController,
    AdminProviderAvailabilityExceptionsController,
    AdminProviderMatchingController,
    AdminBookingSchedulingController,
    ProviderOffersController,
    ProviderDashboardController,
    AdminDashboardController,
    PublicFindCareController,
    ProviderCareServicesController,
    AdminCareServicesController,
  ],
  providers: [
    ProviderCapabilitiesService,
    ProviderServiceAreasService,
    ProviderAvailabilityService,
    ProviderAvailabilityExceptionsService,
    ProviderMatchingService,
    AdminBookingSchedulingService,
    CurrentProviderService,
    ProviderConfigurationContextService,
    ProviderOnboardingReadinessService,
    ProviderSelfServiceConfigurationService,
    ProviderOffersService,
    AdminProviderAssignmentsService,
    AdminMatchingQueueService,
    AdminBookingDetailService,
    AdminProvidersService,
    ProviderInvitationsService,
    ProviderOnboardingService,
    ProviderDashboardService,
    AdminDashboardService,
    ProviderCareServicesService,
    FindCareService,
    ProviderCareEligibilityService,
  ],
  exports: [
    ProviderCapabilitiesService,
    ProviderAvailabilityService,
    ProviderMatchingService,
    CurrentProviderService,
    AdminBookingSchedulingService,
    ProviderCareEligibilityService,
  ],
})
export class ProvidersModule {}
