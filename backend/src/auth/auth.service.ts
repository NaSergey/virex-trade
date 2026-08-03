import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { resolveJwtAccessSecret } from './jwt-secret';

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string; // raw token — controller puts it in an HttpOnly cookie
}

@Injectable()
export class AuthService {
  private readonly accessSecret = resolveJwtAccessSecret();
  private readonly accessTtl = process.env.JWT_ACCESS_TTL || '15m';
  private readonly refreshTtlDays = Number(
    process.env.JWT_REFRESH_TTL_DAYS || '7',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        name: dto.name ?? null,
      },
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    return this.issueTokens(user);
  }

  // Validate the raw refresh token, rotate it (single-use), issue a new pair.
  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) {
      throw new UnauthorizedException('Refresh-токен отсутствует');
    }

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Недействительный refresh-токен');
    }

    // Rotation: the presented token is always consumed.
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh-токен истёк');
    }

    return this.issueTokens(stored.user);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    // deleteMany so an already-rotated/absent token doesn't throw.
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }
    return this.toPublicUser(user);
  }

  get refreshCookieMaxAgeMs(): number {
    return this.refreshTtlDays * 24 * 60 * 60 * 1000;
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    name: string | null;
  }): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      // env value is a plain string ("15m"); cast to the lib's expiresIn type.
      expiresIn: this.accessTtl as JwtSignOptions['expiresIn'],
    });

    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshCookieMaxAgeMs);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt,
      },
    });

    return {
      user: this.toPublicUser(user),
      accessToken,
      refreshToken,
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string | null;
  }): PublicUser {
    return { id: user.id, email: user.email, name: user.name };
  }
}
