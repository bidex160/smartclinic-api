import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: UserRole, isArray: true }) roles!: UserRole[];
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  static fromEntity(user: User): UserResponseDto {
    return { id: user.id, email: user.email!, displayName: user.displayName!, roles: user.roles, status: user.status };
  }
}
