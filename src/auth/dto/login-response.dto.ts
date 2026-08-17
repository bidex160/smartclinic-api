import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';
export class LoginResponseDto { @ApiProperty() accessToken!: string; @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto; }
