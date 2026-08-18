import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { UserCredential } from './entities/user-credential.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminUserSearchController } from './admin-user-search.controller';
import { AdminUserSearchService } from './admin-user-search.service';

@Module({ imports: [TypeOrmModule.forFeature([User, UserCredential]), AuthModule], controllers: [AdminUserSearchController], providers: [AdminUserSearchService], exports: [TypeOrmModule] })
export class UsersModule {}
