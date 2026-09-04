import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailModule } from '../notifications/email/email.module';
import { CohortContactController } from './cohort-contact.controller';
import { CohortContactService } from './cohort-contact.service';
import { CohortContactSubmission } from './entities/cohort-contact-submission.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([CohortContactSubmission]),
    EmailModule,
  ],
  controllers: [CohortContactController],
  providers: [CohortContactService],
})
export class CohortContactModule {}