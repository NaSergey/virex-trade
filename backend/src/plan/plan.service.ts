import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PlanItem, type PlanSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CATEGORIES } from './categories';
import type {
  BlockDto,
  ItemDto,
  ItemPatchDto,
  SettingsDto,
} from './dto/plan.dto';
import {
  addDays,
  DAY_RE,
  hasDay,
  hhmm,
  isValidTz,
  localNow,
  minuteOfDay,
  type LocalNow,
} from './plan-time';
import { outcomeOf, report, summarize, type Status } from './plan-stats';
import type { MsgItem } from './plan-messages';

/** Насколько вперёд и назад открывается день: дальше — опечатка в адресе, а не план. */
const DAY_RANGE = 400;
/** Статистика — не длиннее этого окна. */
const MAX_STATS_DAYS = 366;

export interface ItemView extends MsgItem {
  blockId: string | null;
  status: Status;
  outcome: ReturnType<typeof outcomeOf>;
  startedAt: string | null;
  note: string | null;
}

type Task = { text: string; done: boolean };

/**
 * План дня владельца (спека docs/superpowers/specs/2026-10-23-daily-plan-design.md).
 *
 * Недельный шаблон — блоки с днями недели; день собирается из шаблона, когда
 * его впервые открыли или до него дошёл `worker`, и дальше живёт сам: правка
 * дня шаблон не трогает. Правка шаблона пересобирает только будущие дни,
 * которые руками не правили, — сегодняшний уже мог получить ответы.
 */
@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  // ── настройки и «сейчас» ──

  async settings(): Promise<PlanSettings> {
    return this.prisma.planSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  async saveSettings(dto: SettingsDto) {
    if (!isValidTz(dto.tz))
      throw new BadRequestException('Неизвестный часовой пояс');
    const data = {
      tz: dto.tz,
      morningMin: dto.morningMin ?? null,
      eveningMin: dto.eveningMin ?? null,
      leadMin: dto.leadMin,
    };
    return this.prisma.planSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
  }

  async now(
    at: Date = new Date(),
  ): Promise<{ settings: PlanSettings; now: LocalNow }> {
    const settings = await this.settings();
    return { settings, now: localNow(settings.tz, at) };
  }

  // ── шаблон ──

  template() {
    return this.prisma.planBlock.findMany({
      orderBy: [{ startMin: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async addBlock(dto: BlockDto) {
    checkSpan(dto.startMin, dto.endMin);
    const block = await this.prisma.planBlock.create({ data: blockData(dto) });
    await this.dropFutureDays();
    return block;
  }

  async saveBlock(id: string, dto: BlockDto) {
    checkSpan(dto.startMin, dto.endMin);
    const res = await this.prisma.planBlock.updateMany({
      where: { id },
      data: blockData(dto),
    });
    if (res.count === 0) throw new NotFoundException('Блок не найден');
    await this.dropFutureDays();
    return { success: true };
  }

  async deleteBlock(id: string) {
    await this.prisma.planBlock.deleteMany({ where: { id } });
    await this.dropFutureDays();
    return { success: true };
  }

  /** Будущие дни без ручных правок соберутся заново из нового шаблона. */
  private async dropFutureDays() {
    const { now } = await this.now();
    await this.prisma.planDay.deleteMany({
      where: { day: { gt: now.day }, edited: false },
    });
  }

  // ── день ──

  /**
   * День из базы; сегодняшний и будущий — собирается из шаблона при первом
   * обращении. Прошлый день без строки так и остаётся пустым: задним числом
   * план не появляется. Гонка двух первых обращений — на ключе `plan_days`.
   */
  async ensureDay(day: string, today: string): Promise<PlanItem[]> {
    const existing = await this.prisma.planDay.findUnique({
      where: { day },
      include: { items: true },
    });
    if (existing) return sortItems(existing.items);
    if (day < today) return [];
    const blocks = (await this.template()).filter((b) => hasDay(b.days, day));
    try {
      await this.prisma.$transaction([
        this.prisma.planDay.create({ data: { day } }),
        this.prisma.planItem.createMany({
          data: blocks.map((b) => ({
            day,
            blockId: b.id,
            startMin: b.startMin,
            endMin: b.endMin,
            title: b.title,
            category: b.category,
            track: b.track,
            tasks: b.tasks.map((text) => ({ text, done: false })),
          })),
        }),
      ]);
    } catch (e) {
      if (
        !(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        )
      )
        throw e;
    }
    return sortItems(await this.prisma.planItem.findMany({ where: { day } }));
  }

  async day(day: string) {
    checkDay(day);
    const { settings, now } = await this.now();
    if (Math.abs(daysBetween(now.day, day)) > DAY_RANGE)
      throw new BadRequestException('День вне диапазона');
    const items = await this.ensureDay(day, now.day);
    const edited =
      (
        await this.prisma.planDay.findUnique({
          where: { day },
          select: { edited: true },
        })
      )?.edited ?? false;
    const views = items.map((i) => this.view(i, settings.tz, now));
    return {
      day,
      today: now.day,
      nowMin: now.min,
      edited,
      items: views,
      summary: summarize(views, now.day, now.min),
    };
  }

  /** Всё для первого экрана: настройки, «сейчас», виды блоков и привязан ли бот у владельца. */
  async state(ownerChat: boolean) {
    const { settings, now } = await this.now();
    return {
      settings: {
        tz: settings.tz,
        morningMin: settings.morningMin,
        eveningMin: settings.eveningMin,
        leadMin: settings.leadMin,
      },
      today: now.day,
      nowMin: now.min,
      categories: CATEGORIES,
      telegram: ownerChat,
    };
  }

  async addItem(day: string, dto: ItemDto) {
    checkDay(day);
    checkSpan(dto.startMin, dto.endMin);
    const { now } = await this.now();
    await this.ensureDay(day, now.day);
    // Прошлый день без строки: плана не было, но отметить сделанное задним числом можно.
    await this.prisma.planDay.upsert({
      where: { day },
      create: { day, edited: true },
      update: { edited: true },
    });
    return this.prisma.planItem.create({
      data: {
        day,
        startMin: dto.startMin,
        endMin: dto.endMin,
        title: dto.title.trim(),
        category: dto.category,
        track: dto.track,
        tasks: plainTasks(dto.tasks),
      },
    });
  }

  async patchItem(id: string, dto: ItemPatchDto) {
    const item = await this.prisma.planItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Блок не найден');
    checkSpan(dto.startMin ?? item.startMin, dto.endMin ?? item.endMin);
    const { status, note, tasks, ...fields } = dto;
    const data: Prisma.PlanItemUpdateInput = {
      ...fields,
      ...(tasks ? { tasks: plainTasks(tasks) } : {}),
      ...(fields.title ? { title: fields.title.trim() } : {}),
      ...(note !== undefined ? { note: note.trim() || null } : {}),
      ...(status ? statusData(item, status as Status) : {}),
    };
    const updated = await this.prisma.planItem.update({ where: { id }, data });
    // Смена времени или состава — правка дня; ответ и отметки пунктов — нет.
    if (
      ['startMin', 'endMin', 'title', 'category', 'track'].some(
        (k) => k in fields,
      )
    ) {
      await this.prisma.planDay.update({
        where: { day: item.day },
        data: { edited: true },
      });
    }
    return updated;
  }

  async deleteItem(id: string) {
    const item = await this.prisma.planItem.findUnique({ where: { id } });
    if (!item) return { success: true };
    await this.prisma.$transaction([
      this.prisma.planItem.delete({ where: { id } }),
      this.prisma.planDay.update({
        where: { day: item.day },
        data: { edited: true },
      }),
    ]);
    return { success: true };
  }

  /**
   * Пересобрать день из шаблона: блоки без ответа и без напоминания уходят,
   * блоки шаблона, которых в дне нет, приходят. Отвеченное остаётся — это уже
   * отчётность.
   */
  async rebuild(day: string) {
    checkDay(day);
    const { now } = await this.now();
    if (day < now.day)
      throw new BadRequestException('Прошлый день не пересобирается');
    await this.ensureDay(day, now.day);
    await this.prisma.planItem.deleteMany({
      where: { day, status: 'planned', notifiedAt: null },
    });
    const kept = new Set(
      (
        await this.prisma.planItem.findMany({
          where: { day },
          select: { blockId: true },
        })
      ).map((i) => i.blockId),
    );
    const blocks = (await this.template()).filter(
      (b) => hasDay(b.days, day) && !kept.has(b.id),
    );
    await this.prisma.planItem.createMany({
      data: blocks.map((b) => ({
        day,
        blockId: b.id,
        startMin: b.startMin,
        endMin: b.endMin,
        title: b.title,
        category: b.category,
        track: b.track,
        tasks: b.tasks.map((text) => ({ text, done: false })),
      })),
    });
    await this.prisma.planDay.update({
      where: { day },
      data: { edited: false },
    });
    return this.day(day);
  }

  /** Ответ кнопкой бота или страницы. */
  async setStatus(id: string, status: Status, at: Date = new Date()) {
    const item = await this.prisma.planItem.findUnique({ where: { id } });
    if (!item) return null;
    return this.prisma.planItem.update({
      where: { id },
      data: statusData(item, status, at),
    });
  }

  // ── отчётность ──

  async stats(days: number, at: Date = new Date()) {
    const n = Math.max(1, Math.min(MAX_STATS_DAYS, Math.floor(days) || 7));
    const { settings, now } = await this.now(at);
    const list = Array.from({ length: n }, (_, i) =>
      addDays(now.day, i - n + 1),
    );
    // Сегодняшний день — в отчёте, даже если страницу ещё не открывали.
    await this.ensureDay(now.day, now.day);
    const items = await this.prisma.planItem.findMany({
      where: { day: { gte: list[0], lte: now.day } },
    });
    return {
      today: now.day,
      nowMin: now.min,
      ...report(
        items.map((i) => this.view(i, settings.tz, now)),
        list,
        now.day,
        now.min,
      ),
    };
  }

  view(i: PlanItem, tz: string, now: LocalNow): ItemView {
    const startedAt = i.startedAt ? minuteOfDay(tz, i.day, i.startedAt) : null;
    const base = {
      id: i.id,
      blockId: i.blockId,
      day: i.day,
      startMin: i.startMin,
      endMin: i.endMin,
      title: i.title,
      category: i.category,
      track: i.track,
      tasks: (Array.isArray(i.tasks) ? i.tasks : []) as Task[],
      status: i.status as Status,
      lateMin: startedAt == null ? null : startedAt - i.startMin,
      startedAt: startedAt == null ? null : hhmm(startedAt),
      note: i.note,
    };
    return { ...base, outcome: outcomeOf(base, now.day, now.min) };
  }
}

/**
 * Поля статуса. «Сажусь» ставит время начала только в первый раз: повторное
 * «всё-таки сажусь» после «забил» — тоже начало, а «сделал» после «сажусь» —
 * нет, опоздание остаётся тем, каким было.
 */
function statusData(
  item: PlanItem,
  status: Status,
  at: Date = new Date(),
): Prisma.PlanItemUpdateInput {
  return {
    status,
    answeredAt: status === 'planned' ? null : at,
    ...(status === 'started' && (!item.startedAt || item.status !== 'started')
      ? { startedAt: at }
      : {}),
    ...(status === 'planned' ? { startedAt: null } : {}),
  };
}

const plainTasks = (tasks: Task[]): Task[] =>
  tasks.map((t) => ({ text: t.text.trim(), done: t.done }));

function blockData(dto: BlockDto) {
  return {
    days: dto.days,
    startMin: dto.startMin,
    endMin: dto.endMin,
    title: dto.title.trim(),
    category: dto.category,
    track: dto.track,
    tasks: dto.tasks.map((t) => t.trim()).filter(Boolean),
  };
}

const sortItems = (items: PlanItem[]) =>
  [...items].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      a.endMin - b.endMin ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );

function checkDay(day: string) {
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)))
    throw new BadRequestException('Bad day');
}

function checkSpan(start: number, end: number) {
  if (end <= start)
    throw new BadRequestException(
      'Конец блока — позже начала (через полночь — двумя блоками)',
    );
}

const daysBetween = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
