import { Controller,Get,Param,Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InstitutionalVirtualCareService } from './institutional-virtual-care.service';
@ApiTags('Institutional care')
@Controller('public/institutions')
export class InstitutionalVirtualCareController{
 constructor(private readonly care:InstitutionalVirtualCareService){}
 @Get() list(@Query('q')q?:string){return this.care.institutions(q);}
 @Get(':reference') detail(@Param('reference')reference:string){return this.care.detail(reference);}
}