import { Body,Controller,Get,Post,Req,UseGuards } from '@nestjs/common';import { JwtAuthGuard } from '../auth/jwt-auth.guard';import { RolesGuard } from '../auth/roles.guard';import { Roles } from '../auth/roles.decorator';import { UserRole } from '../users/enums/user-role.enum';import { User } from '../users/entities/user.entity';import { CreateAssistedMatchDto } from './dto/create-assisted-match.dto';import { AssistedMatchingService } from './assisted-matching.service';
@UseGuards(JwtAuthGuard,RolesGuard) @Controller()
export class AssistedMatchingController {constructor(private readonly service:AssistedMatchingService){}
 @Post('me/assisted-matches')@Roles(UserRole.USER)create(@Req()r:{user:User},@Body()d:CreateAssistedMatchDto){return this.service.create(r.user,d);}
 @Get('me/assisted-matches')@Roles(UserRole.USER)list(@Req()r:{user:User}){return this.service.list(r.user);}
 @Get('admin/assisted-matches')@Roles(UserRole.ADMIN)queue(){return this.service.queue();}
}