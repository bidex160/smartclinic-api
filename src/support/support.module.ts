import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { SupportCallbackRequest } from './support-callback-request.entity';
import { AdminSupportController, PublicSupportController } from './support.controller';
import { SupportService } from './support.service';
import { AdminLanguageFeedbackController, LanguageFeedback, LanguageFeedbackService, PublicLanguageFeedbackController } from './language-feedback';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([SupportCallbackRequest, LanguageFeedback])],
  controllers: [PublicSupportController, AdminSupportController, PublicLanguageFeedbackController, AdminLanguageFeedbackController],
  providers: [SupportService, LanguageFeedbackService],
})
export class SupportModule {}
