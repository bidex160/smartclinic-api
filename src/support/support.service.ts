import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { MoreThan, Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { CreateSupportCallbackDto, SupportCallbackListQueryDto, UpdateSupportCallbackDto } from './support.dto';
import { SupportCallbackRequest, SupportCallbackStatus, SupportCallbackTime } from './support-callback-request.entity';

export const SUPPORTED_SUPPORT_COUNTRIES = ['NG', 'GH', 'RW'] as const;

export interface SupportContact {
  phone: string | null;
  whatsapp: string | null;
  hours: string | null;
}

/** At most this many open requests per phone number in a day, so the queue stays useful. */
const DAILY_LIMIT_PER_PHONE = 3;

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportCallbackRequest) private readonly requests: Repository<SupportCallbackRequest>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Numbers come from server settings so operations can change them without a
   * release: SUPPORT_PHONE / SUPPORT_WHATSAPP / SUPPORT_HOURS, with optional
   * per-country overrides such as SUPPORT_PHONE_GH. Missing numbers are null,
   * and the app hides the button.
   */
  contacts(): { default: SupportContact; countries: Record<string, SupportContact> } {
    const read = (key: string) => normalisePhone(this.config.get<string>(key));
    const base: SupportContact = {
      phone: read('SUPPORT_PHONE'),
      whatsapp: read('SUPPORT_WHATSAPP'),
      hours: this.config.get<string>('SUPPORT_HOURS')?.trim().slice(0, 80) || null,
    };
    const countries: Record<string, SupportContact> = {};
    for (const code of SUPPORTED_SUPPORT_COUNTRIES) {
      countries[code] = {
        phone: read(`SUPPORT_PHONE_${code}`) ?? base.phone,
        whatsapp: read(`SUPPORT_WHATSAPP_${code}`) ?? base.whatsapp,
        hours: this.config.get<string>(`SUPPORT_HOURS_${code}`)?.trim().slice(0, 80) || base.hours,
      };
    }
    return { default: base, countries };
  }

  async requestCallback(dto: CreateSupportCallbackDto, user: User | null) {
    const phone = normalisePhone(dto.phone) ?? dto.phone;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.requests.count({ where: { phone, createdAt: MoreThan(since) } });
    if (recent >= DAILY_LIMIT_PER_PHONE) {
      throw new HttpException('We already have your request and will call you soon.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const saved = await this.requests.save(
      this.requests.create({
        reference: `SC-CB-${randomBytes(4).toString('hex').toUpperCase()}`,
        name: dto.name,
        phone,
        countryCode: dto.countryCode ?? null,
        topic: dto.topic,
        preferredTime: dto.preferredTime ?? SupportCallbackTime.ANYTIME,
        message: dto.message || null,
        status: SupportCallbackStatus.OPEN,
        userId: user?.id ?? null,
        handledByUserId: null,
        handledAt: null,
        staffNote: null,
      }),
    );
    return { reference: saved.reference, status: saved.status, preferredTime: saved.preferredTime };
  }

  async list(q: SupportCallbackListQueryDto) {
    const [items, total] = await this.requests.findAndCount({
      where: q.status ? { status: q.status } : {},
      order: { createdAt: q.status === SupportCallbackStatus.OPEN ? 'ASC' : 'DESC' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    return { items: items.map(view), page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) };
  }

  async update(reference: string, dto: UpdateSupportCallbackDto, staff: User) {
    const row = await this.requests.findOne({ where: { reference } });
    if (!row) throw new NotFoundException('Callback request not found');
    row.status = dto.status;
    if (dto.staffNote !== undefined) row.staffNote = dto.staffNote || null;
    row.handledByUserId = dto.status === SupportCallbackStatus.OPEN ? null : staff.id;
    row.handledAt = dto.status === SupportCallbackStatus.OPEN ? null : new Date();
    return view(await this.requests.save(row));
  }
}

function view(r: SupportCallbackRequest) {
  return {
    reference: r.reference,
    name: r.name,
    phone: r.phone,
    countryCode: r.countryCode,
    topic: r.topic,
    preferredTime: r.preferredTime,
    message: r.message,
    status: r.status,
    hasAccount: r.userId !== null,
    handledAt: r.handledAt,
    staffNote: r.staffNote,
    createdAt: r.createdAt,
  };
}

/** "+234 803-000 0000" → "+2348030000000"; anything that isn't a phone number → null. */
export function normalisePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9+]/g, '');
  const normalised = digits.startsWith('+') ? `+${digits.slice(1).replace(/\+/g, '')}` : digits.replace(/\+/g, '');
  return /^\+?[0-9]{7,15}$/.test(normalised) ? normalised : null;
}
