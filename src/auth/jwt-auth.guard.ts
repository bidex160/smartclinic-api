import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService, @InjectRepository(User) private readonly users: Repository<User>) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: User }>();
    const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Authentication is required');
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) throw new UnauthorizedException('Authentication is required');
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Authentication is required');
    }
  }
}
