import { NotFoundException } from '@nestjs/common';
import { EnglishService } from './english.service';

function makePrisma(removedWords = 1) {
  const prisma = {
    englishCard: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    englishWord: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 'w1', ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: removedWords }),
    },
    englishLesson: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    englishAnswer: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

describe('EnglishService', () => {
  it('карточка: upsert по id, даты — Date', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).saveCard('u01:hello', {
      due: '2026-10-22T10:00:00.000Z',
      interval: 1,
      ease: 2.5,
      reps: 1,
      lapses: 0,
      firstAt: '2026-10-21T10:00:00.000Z',
    });
    const { where, create, update } =
      prisma.englishCard.upsert.mock.calls[0][0];
    expect(where).toEqual({ cardId: 'u01:hello' });
    expect(create.cardId).toBe('u01:hello');
    expect(update.due).toEqual(new Date('2026-10-22T10:00:00.000Z'));
    expect(update.firstAt).toBeInstanceOf(Date);
    expect(update).not.toHaveProperty('cardId');
  });

  it('ответ: первый создаёт счётчики, следующий их наращивает', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).answer({
      itemId: 'u01-03',
      unit: 'u01',
      correct: false,
    });
    const { create, update } = prisma.englishAnswer.upsert.mock.calls[0][0];
    expect(create).toMatchObject({ right: 0, wrong: 1, lastCorrect: false });
    expect(update).toMatchObject({
      right: { increment: 0 },
      wrong: { increment: 1 },
      lastCorrect: false,
    });
    expect(update.lastAt).toBeInstanceOf(Date);
  });

  it('слово: обрезает пробелы', async () => {
    const prisma = makePrisma();
    const word = await new EnglishService(prisma as never).addWord({
      en: '  apple ',
      ru: ' яблоко',
    });
    expect(word).toEqual({ id: 'w1', en: 'apple', ru: 'яблоко' });
  });

  it('удаление слова снимает и его карточку', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).deleteWord('w1');
    expect(prisma.englishCard.deleteMany).toHaveBeenCalledWith({
      where: { cardId: 'my:w1' },
    });
    expect(prisma.englishWord.deleteMany).toHaveBeenCalledWith({
      where: { id: 'w1' },
    });
  });

  it('удаление несуществующего слова — 404', async () => {
    const prisma = makePrisma(0);
    await expect(
      new EnglishService(prisma as never).deleteWord('nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('урок: отметка — upsert, снятие — deleteMany', async () => {
    const prisma = makePrisma();
    const service = new EnglishService(prisma as never);
    await service.setLesson('u01', true);
    await service.setLesson('u01', false);
    expect(prisma.englishLesson.upsert.mock.calls[0][0].where).toEqual({
      lessonId: 'u01',
    });
    expect(prisma.englishLesson.deleteMany).toHaveBeenCalledWith({
      where: { lessonId: 'u01' },
    });
  });

  it('состояние: уроки — списком id, лишние поля не уходят', async () => {
    const prisma = makePrisma();
    prisma.englishLesson.findMany.mockResolvedValue([
      { lessonId: 'sp', doneAt: new Date() },
    ]);
    prisma.englishWord.findMany.mockResolvedValue([
      { id: 'w1', en: 'a', ru: 'б', createdAt: new Date() },
    ]);
    const state = await new EnglishService(prisma as never).state();
    expect(state.lessons).toEqual(['sp']);
    expect(state.words).toEqual([{ id: 'w1', en: 'a', ru: 'б' }]);
  });
});
