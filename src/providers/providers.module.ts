import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProviderAssignmentHistory } from './entities/provider-assignment-history.entity';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { Provider } from './entities/provider.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Provider, ProviderAssignment, ProviderAssignmentHistory])],
})
export class ProvidersModule {}
