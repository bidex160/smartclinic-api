import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../notifications/email/email.module';
import { PartnerFacilityListing } from '../patient-provider-connections/entities/partner-facility-listing.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AdminFacilityOutreachController, PublicFacilityClaimController } from './facility-outreach.controller';
import { FacilityOutreachService } from './facility-outreach.service';
import { FacilityOutreach, FacilityOutreachEvent } from './outreach.entities';

@Module({
  imports: [AuthModule, EmailModule, WhatsAppModule, TypeOrmModule.forFeature([PartnerFacilityListing, FacilityOutreach, FacilityOutreachEvent])],
  controllers: [AdminFacilityOutreachController, PublicFacilityClaimController],
  providers: [FacilityOutreachService],
  exports: [FacilityOutreachService],
})
export class FacilityOutreachModule {}
