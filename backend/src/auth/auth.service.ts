import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { demoLocked, isDemoEmail } from './demo-account';
import { assertReadableName, isRealEmail } from './identity-rules';
import { GoogleClaims, pickName } from './google-oauth';
import { JwtPayload } from './strategies/jwt.strategy';
import { resolveJwtAccessSecret } from './jwt-secret';
import { isOwnerEmail, isOwnerUser } from '../admin/owner';
import { TagsService } from '../tags/tags.service';
import { CoinsService } from '../coins/coins.service';
import { REFERRAL_BONUS_COINS, REFERRAL_WELCOME_COINS } from '../coins/coins.config';
import { avatarUrl } from '../profile/avatar';

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  /**
   * Открыт ли этому аккаунту раздел аналитики по пользователям.
   *
   * Флагом в ответе, а не сравнением почты на фронте: право решает бэкенд
   * (см. admin/owner.ts), и второе место, где написано, кто владелец, — это
   * место, где однажды окажется другая почта. Пункт меню при этом ничего не
   * охраняет: доступ проверяет AdminGuard на каждом запросе, а флаг только
   * убирает из шапки ссылку, которая всё равно вернула бы 403.
   */
  isAdmin: boolean;
  /** Адрес картинки профиля с версией (`profile/avatar.ts`); нет картинки — null. */
  avatar: string | null;
  /**
   * Есть ли у аккаунта пароль. Нет у заведённого входом через Google: смены
   * пароля в настройках у него нет — он входит только через Google.
   */
  hasPassword: boolean;
}

/** Строка `users`, из которой выдаются токены и собирается `PublicUser`. */
type UserRow = {
  id: string;
  email: string;
  name: string | null;
  avatarAt: Date | null;
  password: string | null;
};

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string; // raw token — controller puts it in an HttpOnly cookie
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret = resolveJwtAccessSecret();
  private readonly accessTtl = process.env.JWT_ACCESS_TTL || '15m';
  private readonly refreshTtlDays = Number(
    process.env.JWT_REFRESH_TTL_DAYS || '7',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tags: TagsService,
    private readonly coins: CoinsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    assertReadableName(dto.name);
    // Почта хранится в нижнем регистре, а занятость проверяется без учёта
    // регистра: уникальный индекс Postgres регистр различает, и до 2026-11-06
    // `WXTX.NS@…` заводился вторым аккаунтом рядом с `wxtx.ns@…` — с правами
    // владельца (owner.ts) и с привязкой его входа через Google.
    const email = dto.email.trim().toLowerCase();
    if (!(await isRealEmail(email))) {
      throw new BadRequestException({
        message: 'Укажите настоящую почту: на этот адрес нельзя отправить письмо',
        code: 'EMAIL_NOT_REAL',
      });
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Пользователь с таким email уже существует',
        code: 'USER_EXISTS',
      });
    }

    const user = await this.createAccount({
      email,
      password: await bcrypt.hash(dto.password, 10),
      // DTO уже обрезал пробелы и потребовал непустое значение. Колонка
      // остаётся nullable ради тех, кто регистрировался, когда имя было
      // необязательным, — их записи трогать незачем.
      name: dto.name,
      ref: dto.ref,
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    // Сначала точное совпадение: у аккаунтов, заведённых до 2026-11-06, почта
    // лежит как её набрали, и два варианта одного адреса — два разных аккаунта.
    // Нет точного — без учёта регистра, самый старый: новые хранятся в нижнем,
    // а человек набирает адрес как угодно.
    const typed = dto.email.trim();
    const user =
      (await this.prisma.user.findUnique({ where: { email: typed } })) ??
      (await this.prisma.user.findFirst({
        where: { email: { equals: typed, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      }));
    if (!user) {
      throw new UnauthorizedException({
        message: 'Неверный email или пароль',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Аккаунт заведён входом через Google. Существование почты это не раскрывает
    // сверх того, что уже говорит регистрация (USER_EXISTS).
    if (!user.password) {
      throw new UnauthorizedException({
        message: 'У этого аккаунта нет пароля — войдите через Google',
        code: 'PASSWORD_NOT_SET',
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

  /**
   * Смена пароля из настроек профиля (спека 2026-10-16).
   *
   * Неверный текущий пароль — 400, а не 401: на 401 клиент решает, что
   * кончилась сессия, и выходит из аккаунта. Новый хэш и снятие всех
   * refresh-токенов пользователя — одной транзакцией: другие устройства
   * выходят (их access-токен доживает свои минуты), а это устройство получает
   * новую пару уже после снятия, иначе транзакция сняла бы и её.
   *
   * Демо-аккаунт — 403: его пароль знает каждый посетитель витрины, и смена
   * сломала бы «Посмотреть демо» всем.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ message: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
    }
    if (isDemoEmail(user.email)) throw demoLocked();
    if (!user.password) {
      throw new BadRequestException({
        message: 'У этого аккаунта нет пароля — он входит через Google',
        code: 'PASSWORD_NOT_SET',
      });
    }
    if (!(await bcrypt.compare(dto.current, user.password))) {
      throw new BadRequestException({ message: 'Текущий пароль неверный', code: 'PASSWORD_WRONG' });
    }
    if (dto.next === dto.current) {
      throw new BadRequestException({ message: 'Новый пароль совпадает с текущим', code: 'PASSWORD_SAME' });
    }

    const password = await bcrypt.hash(dto.next, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { password } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return this.issueTokens(user);
  }

  /**
   * Вход через Google (спека 2026-11-05): `claims` — из `id_token`, который
   * сервер сам получил у Google (`google-oauth.ts`), почта подтверждена.
   *
   * 1. Привязанный аккаунт Google — вход в него.
   * 2. Аккаунт с той же почтой — привязка и вход: Google подтвердил, что почта
   *    этого человека, а второй аккаунт на ту же почту не завести.
   * 3. Иначе — новый аккаунт без пароля, как у регистрации (`createAccount`):
   *    приглашение, монеты, стартовые теги.
   */
  async signInWithGoogle(claims: GoogleClaims, ref?: string): Promise<AuthResult> {
    // Google такую почту не подтвердит, но витрина общая — и её не трогают.
    if (isDemoEmail(claims.email)) throw demoLocked();

    const linked = await this.prisma.googleAccount.findUnique({
      where: { sub: claims.sub },
      include: { user: true },
    });
    if (linked) return this.issueTokens(linked.user);

    // Без учёта регистра: регистрация почту не приводит, а Google отдаёт её в
    // нижнем. Самый старый — если когда-то завелись два, различавшихся регистром.
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: claims.email, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      // По userId, а не create: у аккаунта мог быть привязан прежний аккаунт
      // Google с той же почтой (удалён и заведён заново) — его место занимает новый.
      const link = this.prisma.googleAccount.upsert({
        where: { userId: existing.id },
        create: { sub: claims.sub, userId: existing.id },
        update: { sub: claims.sub },
      });
      if (!existing.password) {
        await link;
        return this.issueTokens(existing);
      }
      // Пароль у аккаунта, который Google видит впервые, ставил кто угодно:
      // регистрация почту не подтверждает. Тот, кто завёл чужой адрес раньше
      // хозяина, сохранил бы вход паролем в аккаунт, где хозяин потом
      // подключит ключ биржи. Google подтвердил хозяина — пароль и все сессии
      // снимаются одной транзакцией с привязкой; вход дальше — через Google.
      const [, owner] = await this.prisma.$transaction([
        link,
        this.prisma.user.update({
          where: { id: existing.id },
          data: { password: null },
        }),
        this.prisma.refreshToken.deleteMany({ where: { userId: existing.id } }),
      ]);
      return this.issueTokens(owner);
    }

    const user = await this.createAccount({
      email: claims.email,
      password: null,
      name: pickName(claims),
      ref,
      googleSub: claims.sub,
    });
    return this.issueTokens(user);
  }

  /**
   * Новый аккаунт — общий у регистрации и входа через Google.
   *
   * Ссылка вида `/?auth=register&ref=<userId>`: ref — id пригласившего.
   * Неизвестный или мусорный ref — то же самое, что его отсутствие, а не
   * повод отклонить регистрацию (см. RegisterDto.ref).
   */
  private async createAccount(input: {
    email: string;
    password: string | null;
    name: string | null;
    ref?: string;
    googleSub?: string;
  }): Promise<UserRow> {
    const invitedById = input.ref ? await this.resolveInviter(input.ref) : null;

    // Создание пользователя и реферальный бонус пригласившему — одна
    // транзакция: начисление не должно разойтись с событием, которое его
    // вызвало (тот же принцип, что у зачёта доната и взносов турнира).
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          password: input.password,
          name: input.name,
          invitedById,
          ...(input.googleSub ? { google: { create: { sub: input.googleSub } } } : {}),
        },
      });
      if (invitedById) {
        await this.coins.credit(tx, invitedById, REFERRAL_BONUS_COINS, 'REFERRAL_BONUS', created.id);
        await this.coins.credit(tx, created.id, REFERRAL_WELCOME_COINS, 'REFERRAL_WELCOME', created.id);
      }
      return created;
    });

    // Примеры тегов, чтобы первую сделку было чем разметить. Провал не
    // отменяет регистрацию: аккаунт без примеров рабочий, а несозданный — нет.
    try {
      await this.tags.createDefaults(user.id);
    } catch (e) {
      this.logger.warn(`не удалось создать стартовые теги для ${user.id}: ${e}`);
    }
    return user;
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

  get refreshCookieMaxAgeMs(): number {
    return this.refreshTtlDays * 24 * 60 * 60 * 1000;
  }

  private async issueTokens(
    user: UserRow,
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
          this.prisma.refreshToken.delete({
            where: { id: opts.consumeTokenId },
          }),
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
      user: this.toPublicUser(
        user,
        isOwnerEmail(user.email) && (await isOwnerUser(this.prisma, user.id)),
      ),
      accessToken,
      refreshToken,
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * id пригласившего — по `userId` ИЛИ по кастомному слагу ссылки
   * (`referralSlug`, см. ReferralsService.setSlug), одним запросом. Слаг
   * сравнивается в нижнем регистре: хранится он тоже в нижнем, а `ref` в
   * адресной строке человек мог набрать как угодно.
   */
  private async resolveInviter(ref: string): Promise<string | null> {
    const inviter = await this.prisma.user.findFirst({
      where: { OR: [{ id: ref }, { referralSlug: ref.toLowerCase() }] },
    });
    return inviter?.id ?? null;
  }

  private toPublicUser(user: UserRow, isAdmin: boolean): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin,
      avatar: avatarUrl(user.id, user.avatarAt),
      hasPassword: user.password != null,
    };
  }
}
