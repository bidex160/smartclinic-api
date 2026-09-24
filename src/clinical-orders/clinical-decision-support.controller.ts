import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { ClinicalDecisionSupportSuggestDto } from './dto/clinical-decision-support.dto';
import { ClinicalDecisionSupportService } from './clinical-decision-support.service';

@ApiTags('Clinical Decision Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(UserRole.PROVIDER)
@Controller('provider/clinical-decision-support')
export class ClinicalDecisionSupportController{
 constructor(private readonly service:ClinicalDecisionSupportService){}
 @Post('suggest') suggest(@Body() dto:ClinicalDecisionSupportSuggestDto){return this.service.suggest(dto);}
}
