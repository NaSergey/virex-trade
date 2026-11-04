import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    englishDay: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    englishTheme: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 't1' }),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 't1', ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    englishRun: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    englishHold: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    englishThemeWord: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

describe('EnglishService', () => {
  it('карточка: upsert по id, даты — Date', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).saveCard({
      cardId: 'u01:hello',
      due: '2026-10-22T10:00:00.000Z',
      interval: 1,
      ease: 2.5,
      reps: 1,
      lapses: 0,
      firstAt: '2026-10-21T10:00:00.000Z',
      known: false,
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
    expect(state.lessons).toEqual([{ id: 'sp', doneAt: expect.any(Date) }]);
    expect(state.words).toEqual([{ id: 'w1', en: 'a', ru: 'б' }]);
  });

  it('карточка и ответ с датой — в счётчик дня той же транзакцией', async () => {
    const prisma = makePrisma();
    const service = new EnglishService(prisma as never);
    await service.saveCard({
      cardId: 'v:house',
      due: '2026-10-22T10:00:00.000Z',
      interval: 1,
      ease: 2.5,
      reps: 1,
      lapses: 0,
      firstAt: '2026-10-21T10:00:00.000Z',
      known: true,
      day: '2026-10-21',
    });
    await service.answer({
      itemId: 'u01-01',
      unit: 'u01',
      correct: true,
      day: '2026-10-21',
    });
    expect(prisma.englishCard.upsert.mock.calls[0][0].update.known).toBe(true);
    const [card, answer] = prisma.englishDay.upsert.mock.calls.map((c) => c[0]);
    expect(card.create).toEqual({ day: '2026-10-21', cards: 1 });
    expect(answer.update).toEqual({
      answers: { increment: 1 },
      correct: { increment: 1 },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('без даты день не считается', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).answer({
      itemId: 'u01-01',
      unit: 'u01',
      correct: false,
    });
    expect(prisma.englishDay.upsert).not.toHaveBeenCalled();
  });

  it('удаление слова снимает его из тем', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).deleteWord('w1');
    expect(prisma.englishThemeWord.deleteMany).toHaveBeenCalledWith({
      where: { cardId: 'my:w1' },
    });
  });

  it('слово в несуществующую тему — 404, снятие — без проверки', async () => {
    const prisma = makePrisma();
    prisma.englishTheme.findUnique.mockResolvedValue(null);
    const service = new EnglishService(prisma as never);
    await expect(
      service.setThemeWord('nope', 'v:house', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.setThemeWord('nope', 'v:house', false);
    expect(prisma.englishThemeWord.deleteMany).toHaveBeenCalledWith({
      where: { themeId: 'nope', cardId: 'v:house' },
    });
  });

  it('ответ в тесте — в счётчик дня', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).quiz('2026-10-22');
    expect(prisma.englishDay.upsert.mock.calls[0][0].create).toEqual({
      day: '2026-10-22',
      quiz: 1,
    });
  });

  it('тема со словами — одной записью, повторы схлопываются', async () => {
    const prisma = makePrisma();
    const theme = await new EnglishService(prisma as never).addTheme(
      ' Разбор ',
      ['v:house', 'v:house', 'u01:hello'],
    );
    expect(prisma.englishTheme.create).toHaveBeenCalledWith({
      data: {
        title: 'Разбор',
        words: { create: [{ cardId: 'v:house' }, { cardId: 'u01:hello' }] },
      },
    });
    expect(theme.cards).toEqual(['v:house', 'u01:hello']);
  });

  it('забег: createMany без дублей, даты — Date', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).saveRun({
      id: 'run12345abc',
      startedAt: '2026-11-04T10:00:00.000Z',
      finishedAt: '2026-11-04T10:08:00.000Z',
      character: 'tourist',
      fog: 0,
      outcome: 'win',
      depth: 10,
      score: 640,
      stats: { v: 1 },
    });
    const arg = prisma.englishRun.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data[0].id).toBe('run12345abc');
    expect(arg.data[0].startedAt).toEqual(new Date('2026-11-04T10:00:00.000Z'));
    expect(arg.data[0].finishedAt).toBeInstanceOf(Date);
    expect(arg.data[0].stats).toEqual({ v: 1 });
  });

  it('забег со статистикой больше 16 КБ — 400', async () => {
    const prisma = makePrisma();
    await expect(
      new EnglishService(prisma as never).saveRun({
        id: 'run12345abc',
        startedAt: '2026-11-04T10:00:00.000Z',
        finishedAt: '2026-11-04T10:08:00.000Z',
        character: 'tourist',
        fog: 0,
        outcome: 'dead',
        depth: 3,
        score: 50,
        stats: { junk: 'x'.repeat(17_000) },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.englishRun.createMany).not.toHaveBeenCalled();
  });

  it('забеги: свежие сверху, не больше 1000, даты наружу ISO', async () => {
    const prisma = makePrisma();
    prisma.englishRun.findMany.mockResolvedValue([
      {
        id: 'r1',
        startedAt: new Date('2026-11-04T10:00:00.000Z'),
        finishedAt: new Date('2026-11-04T10:08:00.000Z'),
        character: 'tourist',
        fog: 0,
        outcome: 'win',
        depth: 10,
        score: 640,
        stats: { v: 1 },
      },
    ]);
    const runs = await new EnglishService(prisma as never).runs();
    expect(prisma.englishRun.findMany).toHaveBeenCalledWith({
      orderBy: { finishedAt: 'desc' },
      take: 1000,
    });
    expect(runs[0].startedAt).toBe('2026-11-04T10:00:00.000Z');
    expect(runs[0].finishedAt).toBe('2026-11-04T10:08:00.000Z');
  });

  it('ответ в игре — в счётчик дня game', async () => {
    const prisma = makePrisma();
    await new EnglishService(prisma as never).game('2026-11-04');
    const { create, update } = prisma.englishDay.upsert.mock.calls[0][0];
    expect(create).toEqual({ day: '2026-11-04', game: 1 });
    expect(update).toEqual({ game: { increment: 1 } });
  });

  it('состояние отдаёт игру у дня', async () => {
    const prisma = makePrisma();
    prisma.englishDay.findMany.mockResolvedValue([
      {
        day: '2026-11-04',
        cards: 1,
        answers: 0,
        correct: 0,
        phrases: 0,
        quiz: 0,
        game: 7,
      },
    ]);
    const state = await new EnglishService(prisma as never).state();
    expect(state.days[0].game).toBe(7);
  });

  it('игра «Ashen Hold»: новее — пишется, старее — нет, слишком большая — отказ', async () => {
    const prisma = makePrisma();
    prisma.englishHold.findUnique.mockResolvedValue({
      state: { v: 1, day: 3 },
      savedAt: new Date(5000),
    });
    const svc = new EnglishService(prisma as never);
    const out = await svc.saveHold({ state: { v: 1, day: 4 }, savedAt: 9000 });
    // Перезапись — только если сохранённое старше присланного.
    expect(prisma.englishHold.updateMany.mock.calls[0][0].where).toEqual({
      id: 'main',
      savedAt: { lt: new Date(9000) },
    });
    expect(out).toEqual({ state: { v: 1, day: 3 }, savedAt: 5000 });
    await expect(
      svc.saveHold({ state: { big: 'x'.repeat(300_000) }, savedAt: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
