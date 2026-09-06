import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserCredential } from '../users/entities/user-credential.entity';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthSession } from './entities/auth-session.entity';
import { Patient } from '../patients/entities/patient.entity';
import { RewardsModule } from '../rewards/rewards.module';
import { EmailModule } from '../notifications/email/email.module';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RewardsModule),
    EmailModule,

    TypeOrmModule.forFeature([
      User,
      UserCredential,
      AuthSession,
      Patient,
      PasswordResetToken,
    ]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '15m',
          ) as never,
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    PasswordResetService,
    JwtAuthGuard,
    RolesGuard,
  ],

  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    JwtModule,
  ],
})
export class AuthModule {}
