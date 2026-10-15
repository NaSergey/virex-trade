import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, open, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { OWNER_EMAIL } from '../admin/owner';
import { runsBackgroundJobs } from '../role';
import { isDue, lastSlot, partNames, pgEnvOf } from './backup-schedule';

const run = promisify(execFile);

const TICK_MS = 60 * 60_000;
const DUMP_TIMEOUT_MS = 10 * 60_000;
/** Лимит Bot API — 50 МБ на файл; запас — под multipart и подпись. */
const PART_BYTES = 45 * 1024 * 1024;
/**
 * Рыночные данные BTC — не данные пользователей (решение владельца): свечи
 * синк дольёт с Binance сам. Структура таблиц в дампе остаётся.
 */
const MARKET_TABLES = ['price_candles', 'liquidity_snapshots'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sizeOf(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/**
 * Бэкап базы владельцу в Telegram раз в неделю (понедельник, 00:00 UTC).
 * Спека — docs/superpowers/specs/2026-10-15-db-backup-telegram-design.md.
 *
 * Включён только переменной `DB_BACKUP_TELEGRAM=1`, а она стоит только у
 * `worker` в docker-compose.prod.yml: локальный запуск слал бы базу
 * разработчика в тот же чат. Проверка раз в час, а не по cron: пропущенный
 * слот (worker лежал) догоняется сразу, как он поднялся, а снятый — не
 * повторяется после перезапуска, потому что отправленные бэкапы записаны в
 * `db_backups`. На диске после прогона не остаётся ничего.
 */
@Injectable()
export class DbBackupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DbBackupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  /** Слот, о сбое которого владелец уже знает: текст — раз в неделю, а не каждый час. */
  private reportedSlot: number | null = null;
  /** Полем, чтобы тест резал на части без 45 МБ файла. */
  protected partBytes = PART_BYTES;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    if (process.env.DB_BACKUP_TELEGRAM !== '1') return;
    if (!this.telegram.enabled) {
      this.logger.warn('DB_BACKUP_TELEGRAM включён, но TELEGRAM_BOT_TOKEN нет — бэкап не шлётся');
      return;
    }
    void this.tick().catch((e) => this.logger.error(`бэкап базы упал: ${e}`));
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.error(`бэкап базы упал: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const last = await this.prisma.dbBackup.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } });
      if (!isDue(last?.sentAt ?? null, now)) return;

      const owner = await this.prisma.user.findFirst({
        where: { email: { equals: OWNER_EMAIL, mode: 'insensitive' } },
        select: { telegramChatId: true },
      });
      const chatId = owner?.telegramChatId;
      if (!chatId) {
        this.logger.warn('бэкап базы ждёт: у владельца не привязан Telegram');
        return;
      }

      try {
        const sent = await this.sendBackup(chatId, now);
        await this.prisma.dbBackup.create({ data: sent });
        this.logger.log(`бэкап базы отправлен: ${sizeOf(sent.bytes)}, частей ${sent.parts}`);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        this.logger.error(`бэкап базы не снят: ${reason}`);
        const slot = lastSlot(now).getTime();
        if (this.reportedSlot !== slot) {
          this.reportedSlot = slot;
          await this.telegram.sendText(
            chatId,
            `⚠️ Бэкап базы не снят: ${esc(reason.slice(0, 300))}\nПовтор — каждый час.`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async sendBackup(chatId: string, now: Date): Promise<{ bytes: number; parts: number }> {
    const name = `trade-play-${now.toISOString().slice(0, 10)}.dump`;
    const dir = await mkdtemp(join(tmpdir(), 'tp-backup-'));
    try {
      const file = join(dir, name);
      await this.dump(file);
      const { size } = await stat(file);
      const count = Math.max(1, Math.ceil(size / this.partBytes));
      const names = partNames(name, count);

      const fh = await open(file, 'r');
      try {
        for (let i = 0; i < count; i++) {
          const length = Math.min(this.partBytes, size - i * this.partBytes);
          const chunk = Buffer.alloc(length);
          await fh.read(chunk, 0, length, i * this.partBytes);
          const caption = i === 0 ? this.caption(name, size, count) : `Часть ${i + 1} из ${count}`;
          const ok = await this.telegram.sendDocument(chatId, chunk, names[i], caption);
          if (!ok) throw new Error(`Telegram не принял ${names[i]}`);
        }
      } finally {
        await fh.close();
      }
      return { bytes: size, parts: count };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private caption(name: string, size: number, count: number): string {
    const lines = [
      `💾 <b>Бэкап базы Trade Play</b> — ${name.slice(11, 21)}, ${sizeOf(size)}`,
      'Только данные пользователей: свечей и стакана BTC в нём нет, свечи синк дольёт с Binance сам.',
    ];
    if (count > 1) {
      lines.push('', `Часть 1 из ${count}. Склеить:`, `<code>cat ${name}.part* &gt; ${name}</code>`);
    }
    lines.push('', 'Восстановить:', `<code>pg_restore --clean --if-exists --no-owner -d virex ${name}</code>`);
    return lines.join('\n');
  }

  /** `pg_dump` в файл; пароль — переменной окружения, в текст ошибки он не попадёт. */
  protected async dump(file: string): Promise<void> {
    await run(
      'pg_dump',
      ['--format=custom', ...MARKET_TABLES.map((t) => `--exclude-table-data=${t}`), `--file=${file}`],
      { env: { ...process.env, ...pgEnvOf(process.env.DATABASE_URL ?? '') }, timeout: DUMP_TIMEOUT_MS },
    );
  }
}
