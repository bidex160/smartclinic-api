import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError, Repository } from 'typeorm';
import { UserCredential } from '../users/entities/user-credential.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class AuthService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>, @InjectRepository(UserCredential) private readonly credentials: Repository<UserCredential>, private readonly jwt: JwtService) {}
  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.exists({ where: { emailNormalized: email } })) throw new ConflictException('An account already exists for this email');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.users.manager.transaction(async manager => {
        const saved = await manager.getRepository(User).save(manager.getRepository(User).create({ email, emailNormalized: email, displayName: dto.displayName.trim(), status: UserStatus.ACTIVE, roles: [UserRole.USER] }));
        await manager.getRepository(UserCredential).save(manager.getRepository(UserCredential).create({ userId: saved.id, passwordHash }));
        return saved;
      });
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { constraint?: string }).constraint === 'UQ_users_email_normalized') throw new ConflictException('An account already exists for this email');
      throw error;
    }
  }
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findOne({ where: { emailNormalized: dto.email.trim().toLowerCase() }, relations: { credential: true } });
    if (!user || !user.credential || user.status !== UserStatus.ACTIVE || user.deletedAt || !(await bcrypt.compare(dto.password, user.credential.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    return { accessToken: await this.jwt.signAsync({ sub: user.id }), user: UserResponseDto.fromEntity(user) };
  }
  me(user: User): UserResponseDto { return UserResponseDto.fromEntity(user); }
}
