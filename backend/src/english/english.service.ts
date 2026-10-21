import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CardStateDto } from './dto/card-state.dto';
import type { WordDto } from './dto/word.dto';
import type { AnswerDto } from './dto/answer.dto';

/** Карточка своего слова — тот же id строит фронт (`views/english/model/deck.ts`). */
export const myCardId = (wordId: string) => `my:${wordId}`;

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
    const [cards, words, lessons, answers] = await Promise.all([
      this.prisma.englishCard.findMany(),
      this.prisma.englishWord.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.englishLesson.findMany({ orderBy: { doneAt: 'asc' } }),
      this.prisma.englishAnswer.findMany(),
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
      })),
      words: words.map((w) => ({ id: w.id, en: w.en, ru: w.ru })),
      lessons: lessons.map((l) => l.lessonId),
      answers: answers.map((a) => ({
        itemId: a.itemId,
        unit: a.unit,
        right: a.right,
        wrong: a.wrong,
        lastCorrect: a.lastCorrect,
      })),
    };
  }

  async saveCard(cardId: string, dto: CardStateDto) {
    const data = {
      due: new Date(dto.due),
      interval: dto.interval,
      ease: dto.ease,
      reps: dto.reps,
      lapses: dto.lapses,
      firstAt: new Date(dto.firstAt),
    };
    await this.prisma.englishCard.upsert({
      where: { cardId },
      create: { cardId, ...data },
      update: data,
    });
    return { ok: true };
  }

  async addWord(dto: WordDto) {
    const word = await this.prisma.englishWord.create({
      data: { en: dto.en.trim(), ru: dto.ru.trim() },
    });
    return { id: word.id, en: word.en, ru: word.ru };
  }

  /** Слово уходит вместе с состоянием своей карточки — иначе строка осталась бы сиротой. */
  async deleteWord(id: string) {
    const [, removed] = await this.prisma.$transaction([
      this.prisma.englishCard.deleteMany({ where: { cardId: myCardId(id) } }),
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
    await this.prisma.englishAnswer.upsert({
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
    });
    return { ok: true };
  }
}
