import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Provider } from '../providers/entities/provider.entity';
import { ProvidersModule } from '../providers/providers.module';
import { CareChatService } from './care-chat.service';
import { MeCareChatController, ProviderCareChatController } from './care-chat.controller';
import { CareConversation } from './entities/care-conversation.entity';
import { CareMessage } from './entities/care-message.entity';
import { User } from '../users/entities/user.entity';

@Module({ imports: [AuthModule, ProvidersModule, TypeOrmModule.forFeature([CareConversation, CareMessage, CareRequest, CareAppointment, Patient, Provider, User])], controllers: [MeCareChatController, ProviderCareChatController], providers: [CareChatService], exports: [CareChatService] })
export class CareChatModule {}
