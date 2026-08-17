import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { UserCredential } from './entities/user-credential.entity';

@Module({ imports: [TypeOrmModule.forFeature([User, UserCredential])], exports: [TypeOrmModule] })
export class UsersModule {}
