import { Body, Controller, Post } from '@nestjs/common';
import { CohortContactSubmissionDto } from './dto/cohort-contact-submission.dto';
import { CohortContactService } from './cohort-contact.service';



@Controller('cohort/contact')
export class CohortContactController {
  constructor(
    private readonly cohortContactService: CohortContactService,
  ) {}

  @Post()
  submit(@Body() dto: CohortContactSubmissionDto) {
    return this.cohortContactService.submit(dto);
  }
}