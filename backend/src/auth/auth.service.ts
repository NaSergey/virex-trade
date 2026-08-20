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
      throw new ConflictException({
        message: 'Пользователь с таким email уже существует',
        code: 'USER_EXISTS',
      });
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
      throw new UnauthorizedException({
        message: 'Неверный email или пароль',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException({
        message: 'Неверный email или пароль',
        code: 'INVALID_CREDENTIALS',
      });
    }

    return this.issueTokens(user);
  }

  // Validate the raw refresh token, rotate it (single-use), issue a new pair.
  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) {
      throw new UnauthorizedException({
        message: 'Refresh-токен отсутствует',
        code: 'REFRESH_TOKEN_MISSING',
      });
    }

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException({
        message: 'Недействительный refresh-токен',
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      // Nothing to rotate into — just drop the dead row.
      await this.prisma.refreshToken
        .delete({ where: { id: stored.id } })
        .catch(() => undefined);
      throw new UnauthorizedException({
        message: 'Refresh-токен истёк',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
    }

    // Consuming the presented token and persisting its replacement happen in
    // one transaction: deleting first meant a failure while issuing the new
    // pair logged the user out of a session that was still perfectly valid.
    return this.issueTokens(stored.user, { consumeTokenId: stored.id });
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
      throw new UnauthorizedException({
        message: 'Пользователь не найден',
        code: 'USER_NOT_FOUND',
      });
    }
    return this.toPublicUser(user);
  }

  get refreshCookieMaxAgeMs(): number {
    return this.refreshTtlDays * 24 * 60 * 60 * 1000;
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      name: string | null;
    },
    opts?: { consumeTokenId?: string },
  ): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      // env value is a plain string ("15m"); cast to the lib's expiresIn type.
      expiresIn: this.accessTtl as JwtSignOptions['expiresIn'],
    });

    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshCookieMaxAgeMs);
    const create = this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt,
      },
    });

    if (opts?.consumeTokenId) {
      try {
        await this.prisma.$transaction([
          this.prisma.refreshToken.delete({ where: { id: opts.consumeTokenId } }),
          create,
        ]);
      } catch {
        // The delete found nothing: another request rotated this same token
        // first. Single-use means the loser is rejected, not handed a second
        // valid session off one stolen token.
        throw new UnauthorizedException({
          message: 'Недействительный refresh-токен',
          code: 'REFRESH_TOKEN_INVALID',
        });
      }
    } else {
      await create;
    }

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
