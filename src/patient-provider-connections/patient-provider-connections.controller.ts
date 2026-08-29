import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; import { Roles } from '../auth/roles.decorator'; import { RolesGuard } from '../auth/roles.guard';
import { PaymentFlowService } from '../payments/payment-flow.service'; import { User } from '../users/entities/user.entity'; import { UserRole } from '../users/enums/user-role.enum';
import { ConnectionListQueryDto, ConnectionReferenceParamsDto, ConvertConnectionDto, ProviderConnectionDecisionDto, ResubmitExistingPatientLinkDto, StartExistingPatientLinkDto, StartNewPatientRegistrationDto, UpdateProviderConnectionConfigDto } from './dto/patient-provider-connection.dto';
import { PatientProviderConnectionsService } from './patient-provider-connections.service';

@ApiTags('My Patient Provider Connections') @ApiBearerAuth() @UseGuards(JwtAuthGuard,RolesGuard) @Roles(UserRole.USER) @Controller('me')
export class MePatientProviderConnectionsController {
 constructor(private readonly service:PatientProviderConnectionsService,private readonly payments:PaymentFlowService){}
 @Get('patient-provider-connection-providers') directory(@Req()r:{user:User},@Query()q:ConnectionListQueryDto){return this.service.directory(r.user,q);}
 @Post('patient-provider-connections/new-registration') createNew(@Req()r:{user:User},@Body()d:StartNewPatientRegistrationDto){return this.service.startNew(r.user,d);}
 @Post('patient-provider-connections/existing-link') createExisting(@Req()r:{user:User},@Body()d:StartExistingPatientLinkDto){return this.service.startExisting(r.user,d);}
 @Get('patient-provider-connections') list(@Req()r:{user:User},@Query()q:ConnectionListQueryDto){return this.service.listMine(r.user,q);}
 @Get('patient-provider-connections/:reference') get(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto){return this.service.getMine(r.user,p.reference);}
 @Post('patient-provider-connections/:reference/resubmit') resubmit(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto,@Body()d:ResubmitExistingPatientLinkDto){return this.service.resubmit(r.user,p.reference,d);}
 @Post('patient-provider-connections/:reference/convert-to-new-registration') convert(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto,@Body()d:ConvertConnectionDto){return this.service.convert(r.user,p.reference,d);}
 @Post('patient-provider-connections/:reference/cancel') cancel(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto){return this.service.cancel(r.user,p.reference);}
 @Get('patient-provider-connections/:reference/funding') funding(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto){return this.payments.getPatientProviderConnectionFunding(p.reference,r.user.id);}
 @Post('patient-provider-connections/:reference/funding/initialize') @HttpCode(HttpStatus.OK) initialize(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto){return this.payments.initializePatientProviderConnectionFunding(p.reference,r.user.id);}
 @Post('patient-provider-connections/:reference/funding/verify-latest') @HttpCode(HttpStatus.OK) verify(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto){return this.payments.verifyLatestPatientProviderConnectionFunding(p.reference,r.user.id);}
}
@ApiTags('Provider Patient Connections') @ApiBearerAuth() @UseGuards(JwtAuthGuard,RolesGuard) @Roles(UserRole.PROVIDER) @Controller('provider/patient-connections')
export class ProviderPatientConnectionsController {
 constructor(private readonly service:PatientProviderConnectionsService){}
 @Get('configuration') config(@Req()r:{user:User}){return this.service.getProviderConfig(r.user);}
 @Put('configuration') update(@Req()r:{user:User},@Body()d:UpdateProviderConnectionConfigDto){return this.service.updateProviderConfig(r.user,d);}
 @Get() list(@Req()r:{user:User},@Query()q:ConnectionListQueryDto){return this.service.listProvider(r.user,q);}
 @Get(':reference') get(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto){return this.service.getProvider(r.user,p.reference);}
 @Post(':reference/confirm') confirm(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto,@Body()d:ProviderConnectionDecisionDto){return this.service.confirm(r.user,p.reference,d);}
 @Post(':reference/unable-to-verify') unable(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto,@Body()d:ProviderConnectionDecisionDto){return this.service.unableToVerify(r.user,p.reference,d);}
 @Post(':reference/reject') reject(@Req()r:{user:User},@Param()p:ConnectionReferenceParamsDto,@Body()d:ProviderConnectionDecisionDto){return this.service.reject(r.user,p.reference,d);}
}
