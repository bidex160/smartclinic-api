import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createAppConfiguration } from '../config/environment';
import { UserCredential } from '../users/entities/user-credential.entity';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const configuration = createAppConfiguration();
@Module({
  imports: [TypeOrmModule.forFeature([User, UserCredential]), JwtModule.register({ secret: configuration.auth.jwtSecret, signOptions: { expiresIn: configuration.auth.jwtExpiresIn as never } })],
  controllers: [AuthController], providers: [AuthService, JwtAuthGuard, RolesGuard], exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
