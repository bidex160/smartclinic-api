import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config'; import { Inject } from '@nestjs/common'; import { InjectRepository } from '@nestjs/typeorm'; import { createHash, randomBytes } from 'node:crypto'; import { EntityManager, Repository } from 'typeorm'; import { appConfig } from '../config/app.config'; import { BookingResponseDto } from './dto/booking-response.dto'; import { PublicBookingSession } from './entities/public-booking-session.entity';

export const PUBLIC_BOOKING_SESSION_COOKIE = 'smartclinic_public_booking_session';
@Injectable()
export class PublicBookingSessionService {
  constructor(@InjectRepository(PublicBookingSession) private readonly sessions: Repository<PublicBookingSession>, @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>) {}
  async create(manager: EntityManager, bookingId: string): Promise<string> { const token = randomBytes(32).toString('base64url'); await manager.getRepository(PublicBookingSession).save(manager.getRepository(PublicBookingSession).create({ bookingId, tokenHash: this.hash(token), expiresAt: new Date(Date.now() + this.config.publicBookingSession.ttlSeconds * 1000), revokedAt: null, lastUsedAt: null })); return token; }
  async resolveBooking(token: string | null, reference: string): Promise<BookingResponseDto> { if (!token) this.deny(); const session = await this.sessions.findOne({ where: { tokenHash: this.hash(token!) }, relations: { booking: { healthCheckPackage: true, fulfilmentMode: true, participant: true } } }); if (!session || session.revokedAt || session.expiresAt <= new Date() || session.booking.bookingReference !== reference) this.deny(); session.lastUsedAt = new Date(); await this.sessions.save(session); return BookingResponseDto.fromEntity(session.booking); }
  cookieOptions() { return { httpOnly: true, secure: this.config.publicBookingSession.cookieSecure, sameSite: this.config.publicBookingSession.cookieSameSite, domain: this.config.publicBookingSession.cookieDomain, path: '/api/v1/public/bookings', maxAge: this.config.publicBookingSession.ttlSeconds * 1000 }; }
  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private deny(): never { throw new UnauthorizedException('Invalid or expired public booking session'); }
}
