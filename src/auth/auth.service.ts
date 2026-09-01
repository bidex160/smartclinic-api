import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { QueryFailedError, Repository } from "typeorm";
import { createHash, randomBytes } from "node:crypto";
import { AuthSession } from "./entities/auth-session.entity";
import { createAppConfiguration } from "../config/environment";
import { UserCredential } from "../users/entities/user-credential.entity";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { UserStatus } from "../users/enums/user-status.enum";
import { LoginDto } from "./dto/login.dto";
import { LoginResponseDto } from "./dto/login-response.dto";
import { RegisterDto } from "./dto/register.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { Patient } from "../patients/entities/patient.entity";
import { PatientStatus } from "../patients/enums/patient-status.enum";
import {
  generatePatientReference,
  isPatientReferenceCollision,
  MAX_PATIENT_REFERENCE_GENERATION_ATTEMPTS,
} from "../patients/patient-reference";
import { ReferralsService } from "../rewards/referrals.service";
import { isEmail } from "class-validator";
import { normalizePhoneNumber } from "../users/phone-normalization";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserCredential)
    private readonly credentials: Repository<UserCredential>,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
    private readonly jwt: JwtService,
    private readonly referrals: ReferralsService,
  ) {}
  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone ? normalizePhoneNumber(dto.phone) : null;
    if (dto.phone && !phone)
      throw new ConflictException("A valid phone number is required");
    if (await this.users.exists({ where: { emailNormalized: email } }))
      throw new ConflictException("An account already exists for this email");
    if (phone && await this.users.exists({ where: { phoneNormalized: phone }, withDeleted: true }))
      throw new ConflictException("An account already exists for this phone number");
    const passwordHash = await bcrypt.hash(dto.password, 12);
    for (
      let attempt = 0;
      attempt < MAX_PATIENT_REFERENCE_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const user = await this.users.manager.transaction(async (manager) => {
          const saved = await manager
            .getRepository(User)
            .save(
              manager
                .getRepository(User)
                .create({
                  email,
                  emailNormalized: email,
                  phoneNormalized: phone,
                  displayName: `${dto.givenName.trim()} ${dto.familyName.trim()}`,
                  status: UserStatus.ACTIVE,
                  roles: [UserRole.USER],
                }),
            );
          await manager
            .getRepository(UserCredential)
            .save(
              manager
                .getRepository(UserCredential)
                .create({ userId: saved.id, passwordHash }),
            );
          const patient = await manager
            .getRepository(Patient)
            .save(
              manager
                .getRepository(Patient)
                .create({
                  patientReference: generatePatientReference(),
                  userId: saved.id,
                  givenName: dto.givenName.trim(),
                  familyName: dto.familyName.trim(),
                  dateOfBirth: null,
                  phone,
                  email,
                  status: PatientStatus.ACTIVE,
                }),
            );
          await this.referrals.ensureReferralCode(saved.id, manager);
          if (dto.referralCode)
            await this.referrals.capturePatient(
              manager,
              dto.referralCode,
              saved.id,
              patient.id,
            );
          return saved;
        });
        return UserResponseDto.fromEntity(user);
      } catch (error) {
        if (
          error instanceof QueryFailedError &&
          ["UQ_users_email_normalized", "UQ_users_phone_normalized"].includes(
            (error.driverError as { constraint?: string }).constraint ?? "",
          )
        )
          throw new ConflictException(
            "An account already exists for this email or phone number",
          );
        if (
          !isPatientReferenceCollision(error) ||
          attempt === MAX_PATIENT_REFERENCE_GENERATION_ATTEMPTS - 1
        )
          throw error;
      }
    }
    throw new ConflictException(
      "Unable to generate a unique patient reference",
    );
  }
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    if (dto.identifier && dto.email && dto.identifier.trim().toLowerCase() !== dto.email.trim().toLowerCase())
      throw new UnauthorizedException("Invalid email or password");
    const identifier = (dto.identifier ?? dto.email ?? '').trim();
    const email = isEmail(identifier) ? identifier.toLowerCase() : null;
    const phone = email ? null : normalizePhoneNumber(identifier);
    const user = await this.users.findOne({
      where: email ? { emailNormalized: email } : { phoneNormalized: phone ?? '__invalid__' },
      relations: { credential: true },
    });
    if (
      !user ||
      !user.credential ||
      user.status !== UserStatus.ACTIVE ||
      user.deletedAt ||
      !(await bcrypt.compare(dto.password, user.credential.passwordHash))
    )
      throw new UnauthorizedException("Invalid email or password");
    return this.createSession(user);
  }
  async refresh(token?: string): Promise<LoginResponseDto> {
    if (!token) throw new UnauthorizedException("Invalid refresh session");
    const session = await this.sessions.findOne({
      where: { refreshTokenHash: this.hash(token) },
      relations: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !this.active(session.user)
    )
      throw new UnauthorizedException("Invalid refresh session");
    const raw = this.token();
    session.refreshTokenHash = this.hash(raw);
    session.lastUsedAt = new Date();
    await this.sessions.save(session);
    const response = await this.createAccess(session.user);
    (response as LoginResponseDto & { refreshToken: string }).refreshToken =
      raw;
    return response;
  }
  async logout(token?: string): Promise<void> {
    if (!token) return;
    const session = await this.sessions.findOne({
      where: { refreshTokenHash: this.hash(token) },
    });
    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
    }
  }
  async logoutAll(userId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where("user_id = :userId AND revoked_at IS NULL", { userId })
      .execute();
  }
  async createSession(user: User): Promise<LoginResponseDto> {
    const raw = this.token();
    const c = createAppConfiguration();
    await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        refreshTokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + c.auth.refreshTokenTtl * 1000),
        revokedAt: null,
        lastUsedAt: null,
        userAgent: null,
        ipAddress: null,
      }),
    );
    const response = await this.createAccess(user);
    (response as LoginResponseDto & { refreshToken: string }).refreshToken =
      raw;
    return response;
  }
  private async createAccess(user: User): Promise<LoginResponseDto> {
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      user: UserResponseDto.fromEntity(user),
    };
  }
  private token(): string {
    return randomBytes(48).toString("base64url");
  }
  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
  private active(user: User): boolean {
    return user.status === UserStatus.ACTIVE && !user.deletedAt;
  }
  me(user: User): UserResponseDto {
    return UserResponseDto.fromEntity(user);
  }
}
