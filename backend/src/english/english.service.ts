import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CardStateDto } from './dto/card-state.dto';
import type { WordDto } from './dto/word.dto';
import type { AnswerDto } from './dto/answer.dto';
import type { RunDto } from './dto/run.dto';

/** Карточка своего слова — тот же id строит фронт (`views/english/model/deck.ts`). */
export const myCardId = (wordId: string) => `my:${wordId}`;

/** Сколько дней занятий отдаётся в состоянии — календарь страницы «Сегодня». */
const DAYS_BACK = 400;

type DayCounter = 'cards' | 'answers' | 'correct' | 'phrases' | 'quiz' | 'game';

/** Сколько забегов отдаётся: из них выводится мета игры, сотни строк за годы. */
const RUNS_BACK = 1000;
/** Статистика забега — десятки чисел и id; больше этого — не наш клиент. */
const HOLD_ID = 'main';
/** Игра на 30 дней с докладами и боем — десятки килобайт; потолок с запасом. */
const HOLD_MAX = 200_000;
const STATS_MAX = 16_384;

/**
 * Прогресс владельца в учебнике английского (спека
 * docs/superpowers/specs/2026-10-21-english-course-design.md). Сервер только
 * хранит: материал курса — статика фронта, интервалы карточек считает фронт
 * (`views/english/model/srs.ts`) — единственная копия алгоритма.
 */
@Injectable()
export class EnglishService {
  constructor(private readonly prisma: PrismaService) {}

  /** Всё разом: строк сотни, раздел грузит это одним запросом. */
  async state() {
    const [cards, words, lessons, answers, days, themes] = await Promise.all([
      this.prisma.englishCard.findMany(),
      this.prisma.englishWord.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.englishLesson.findMany({ orderBy: { doneAt: 'asc' } }),
      this.prisma.englishAnswer.findMany(),
      this.prisma.englishDay.findMany({
        orderBy: { day: 'desc' },
        take: DAYS_BACK,
      }),
      this.prisma.englishTheme.findMany({
        orderBy: { createdAt: 'asc' },
        include: { words: { select: { cardId: true } } },
      }),
    ]);
    return {
      cards: cards.map((c) => ({
        cardId: c.cardId,
        due: c.due,
        interval: c.interval,
        ease: c.ease,
        reps: c.reps,
        lapses: c.lapses,
        firstAt: c.firstAt,
        known: c.known,
      })),
      words: words.map((w) => ({ id: w.id, en: w.en, ru: w.ru })),
      lessons: lessons.map((l) => ({ id: l.lessonId, doneAt: l.doneAt })),
      answers: answers.map((a) => ({
        itemId: a.itemId,
        unit: a.unit,
        right: a.right,
        wrong: a.wrong,
        lastCorrect: a.lastCorrect,
      })),
      days: days.map((d) => ({
        day: d.day,
        cards: d.cards,
        answers: d.answers,
        correct: d.correct,
        phrases: d.phrases,
        quiz: d.quiz,
        game: d.game,
      })),
      themes: themes.map((t) => ({
        id: t.id,
        title: t.title,
        cards: t.words.map((w) => w.cardId),
      })),
    };
  }

  /** Счётчик занятий дня — в той же транзакции, что и само занятие. */
  private countDay(day: string, add: Partial<Record<DayCounter, number>>) {
    return this.prisma.englishDay.upsert({
      where: { day },
      create: { day, ...add },
      update: Object.fromEntries(
        Object.entries(add).map(([k, v]) => [k, { increment: v }]),
      ),
    });
  }

  async saveCard(dto: CardStateDto) {
    const { cardId } = dto;
    const data = {
      due: new Date(dto.due),
      interval: dto.interval,
      ease: dto.ease,
      reps: dto.reps,
      lapses: dto.lapses,
      firstAt: new Date(dto.firstAt),
      known: dto.known,
    };
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.englishCard.upsert({
        where: { cardId },
        create: { cardId, ...data },
        update: data,
      }),
    ];
    if (dto.day) ops.push(this.countDay(dto.day, { cards: 1 }));
    await this.prisma.$transaction(ops);
    return { ok: true };
  }

  async addWord(dto: WordDto) {
    const word = await this.prisma.englishWord.create({
      data: { en: dto.en.trim(), ru: dto.ru.trim() },
    });
    return { id: word.id, en: word.en, ru: word.ru };
  }

  /** Слово уходит вместе с состоянием своей карточки и местом в темах. */
  async deleteWord(id: string) {
    const cardId = myCardId(id);
    const [, , removed] = await this.prisma.$transaction([
      this.prisma.englishCard.deleteMany({ where: { cardId } }),
      this.prisma.englishThemeWord.deleteMany({ where: { cardId } }),
      this.prisma.englishWord.deleteMany({ where: { id } }),
    ]);
    if (removed.count === 0) throw new NotFoundException('Word not found');
    return { ok: true };
  }

  async setLesson(lessonId: string, done: boolean) {
    if (done) {
      await this.prisma.englishLesson.upsert({
        where: { lessonId },
        create: { lessonId },
        update: {},
      });
    } else {
      await this.prisma.englishLesson.deleteMany({ where: { lessonId } });
    }
    return { ok: true };
  }

  async answer(dto: AnswerDto) {
    const hit = dto.correct ? 1 : 0;
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.englishAnswer.upsert({
        where: { itemId: dto.itemId },
        create: {
          itemId: dto.itemId,
          unit: dto.unit,
          right: hit,
          wrong: 1 - hit,
          lastCorrect: dto.correct,
        },
        update: {
          unit: dto.unit,
          right: { increment: hit },
          wrong: { increment: 1 - hit },
          lastCorrect: dto.correct,
          lastAt: new Date(),
        },
      }),
    ];
    if (dto.day) ops.push(this.countDay(dto.day, { answers: 1, correct: hit }));
    await this.prisma.$transaction(ops);
    return { ok: true };
  }

  /** Фраза диктанта или произношения — только в счётчик дня. */
  async phrase(day: string) {
    await this.countDay(day, { phrases: 1 });
    return { ok: true };
  }

  /** Ответ в тесте по теме слов — только в счётчик дня: тест — тренировка, не учёт. */
  async quiz(day: string) {
    await this.countDay(day, { quiz: 1 });
    return { ok: true };
  }

  /** Ответ в игре, не сдвинувший карточку и не записанный упражнением, — в счётчик дня. */
  async game(day: string) {
    await this.countDay(day, { game: 1 });
    return { ok: true };
  }

  /** Сохранённая игра «Ashen Hold»; `null` — игры нет. */
  async hold() {
    const row = await this.prisma.englishHold.findUnique({
      where: { id: HOLD_ID },
    });
    return row ? { state: row.state, savedAt: row.savedAt.getTime() } : null;
  }

  /**
   * Сохранить игру «Ashen Hold». Запись старше сохранённой не принимается — отвечаем тем,
   * что лежит: вторая вкладка или другое устройство со старым состоянием не затрут новое.
   */
  async saveHold(dto: { state: Record<string, unknown>; savedAt: number }) {
    if (JSON.stringify(dto.state).length > HOLD_MAX)
      throw new BadRequestException('Game state too large');
    const at = new Date(dto.savedAt);
    const state = dto.state as Prisma.InputJsonValue;
    await this.prisma.englishHold.upsert({
      where: { id: HOLD_ID },
      create: { id: HOLD_ID, state, savedAt: at },
      update: {},
    });
    await this.prisma.englishHold.updateMany({
      where: { id: HOLD_ID, savedAt: { lt: at } },
      data: { state, savedAt: at },
    });
    return this.hold();
  }

  /** Сбросить игру (новая начинается с чистого листа). */
  async deleteHold() {
    await this.prisma.englishHold.deleteMany({ where: { id: HOLD_ID } });
    return { ok: true };
  }

  /** Законченные забеги игры, свежие сверху: из них фронт выводит открытия и рекорды. */
  async runs() {
    const rows = await this.prisma.englishRun.findMany({
      orderBy: { finishedAt: 'desc' },
      take: RUNS_BACK,
    });
    return rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt.toISOString(),
      character: r.character,
      fog: r.fog,
      outcome: r.outcome,
      depth: r.depth,
      score: r.score,
      stats: r.stats,
    }));
  }

  /**
   * Законченный забег. Повтор с тем же id (досылка после обрыва) молча
   * пропускается — `skipDuplicates`, а не перехват ошибки.
   */
  async saveRun(dto: RunDto) {
    if (JSON.stringify(dto.stats).length > STATS_MAX) {
      throw new BadRequestException('Run stats too large');
    }
    await this.prisma.englishRun.createMany({
      data: [
        {
          id: dto.id,
          startedAt: new Date(dto.startedAt),
          finishedAt: new Date(dto.finishedAt),
          character: dto.character,
          fog: dto.fog,
          outcome: dto.outcome,
          depth: dto.depth,
          score: dto.score,
          stats: dto.stats as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
    return { ok: true };
  }

  async addTheme(title: string, cards: string[] = []) {
    const unique = [...new Set(cards)];
    const theme = await this.prisma.englishTheme.create({
      data: {
        title: title.trim(),
        ...(unique.length
          ? { words: { create: unique.map((cardId) => ({ cardId })) } }
          : {}),
      },
    });
    return { id: theme.id, title: theme.title, cards: unique };
  }

  async deleteTheme(id: string) {
    const { count } = await this.prisma.englishTheme.deleteMany({
      where: { id },
    });
    if (count === 0) throw new NotFoundException('Theme not found');
    return { ok: true };
  }

  async setThemeWord(themeId: string, cardId: string, on: boolean) {
    if (!on) {
      await this.prisma.englishThemeWord.deleteMany({
        where: { themeId, cardId },
      });
      return { ok: true };
    }
    const theme = await this.prisma.englishTheme.findUnique({
      where: { id: themeId },
      select: { id: true },
    });
    if (!theme) throw new NotFoundException('Theme not found');
    await this.prisma.englishThemeWord.createMany({
      data: [{ themeId, cardId }],
      skipDuplicates: true,
    });
    return { ok: true };
  }
}
