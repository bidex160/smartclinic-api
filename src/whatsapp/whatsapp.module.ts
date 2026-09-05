import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { MetaWhatsAppAdapter } from './adapters/meta-whatsapp.adapter';
import { WHATSAPP_PROVIDER } from './adapters/whatsapp-provider.interface';
import { WhatsAppIdentity } from './entities/whatsapp-identity.entity';
import { WhatsAppMessage } from './entities/whatsapp-message.entity';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsAppIdentity, WhatsAppMessage, User, Patient])],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, MetaWhatsAppAdapter, { provide: WHATSAPP_PROVIDER, useExisting: MetaWhatsAppAdapter }],
})
export class WhatsAppModule {}
