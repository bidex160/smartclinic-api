import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../notifications/email/email.module';
import { SMS_PROVIDER, smsProviderFromEnv } from '../notifications/sms/sms-provider';
import { PartnerFacilityListing } from '../patient-provider-connections/entities/partner-facility-listing.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FacilityClaimCodeService } from './facility-claim-code.service';
import { AdminFacilityOutreachController, AdminFacilityRegistryController, PublicFacilityClaimCodeController, PublicFacilityClaimController } from './facility-outreach.controller';
import { FacilityOutreachService } from './facility-outreach.service';
import { FacilityOutreach, FacilityOutreachEvent } from './outreach.entities';
import { GooglePlaceMatcher } from './registry/google-places';
import { HfrClient } from './registry/hfr-client';
import { FacilityRegistrySync } from './registry/registry-sync.entity';
import { FACILITY_REGISTRY_CLIENT, FacilityRegistrySyncService } from './registry/registry-sync.service';

@Module({
  imports: [AuthModule, EmailModule, WhatsAppModule, TypeOrmModule.forFeature([PartnerFacilityListing, FacilityOutreach, FacilityOutreachEvent, FacilityRegistrySync])],
  controllers: [AdminFacilityOutreachController, AdminFacilityRegistryController, PublicFacilityClaimCodeController, PublicFacilityClaimController],
  providers: [
    FacilityOutreachService,
    FacilityClaimCodeService,
    FacilityRegistrySyncService,
    GooglePlaceMatcher,
    {
      provide: FACILITY_REGISTRY_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new HfrClient(config.get<string>('HFR_API_KEY') || undefined, config.get<string>('HFR_API_BASE_URL') || undefined),
    },
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => smsProviderFromEnv({
        NODE_ENV: config.get('NODE_ENV'), SMS_PROVIDER: config.get('SMS_PROVIDER'),
        TERMII_API_KEY: config.get('TERMII_API_KEY'), TERMII_SENDER_ID: config.get('TERMII_SENDER_ID'), TERMII_BASE_URL: config.get('TERMII_BASE_URL'),
        AFRICASTALKING_USERNAME: config.get('AFRICASTALKING_USERNAME'), AFRICASTALKING_API_KEY: config.get('AFRICASTALKING_API_KEY'), AFRICASTALKING_SENDER_ID: config.get('AFRICASTALKING_SENDER_ID'),
      }),
    },
  ],
  exports: [FacilityOutreachService],
})
export class FacilityOutreachModule {}
