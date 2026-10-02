import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { SupportCallbackRequest } from './support-callback-request.entity';
import { AdminSupportController, PublicSupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([SupportCallbackRequest])],
  controllers: [PublicSupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
