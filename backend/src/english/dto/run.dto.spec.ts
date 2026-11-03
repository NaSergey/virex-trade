import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RunDto } from './run.dto';

/** Те же опции, что у глобального пайпа (`main.ts`). */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const body = {
  id: 'run12345abc',
  startedAt: '2026-11-04T10:00:00.000Z',
  finishedAt: '2026-11-04T10:08:00.000Z',
  character: 'tourist',
  fog: 0,
  outcome: 'win',
  depth: 10,
  score: 640,
  stats: {
    v: 1,
    modes: { recall: { right: 3, wrong: 1 } },
    scenes: [{ id: 'cafe', stars: 3 }],
  },
};

const run = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: RunDto }) as Promise<RunDto>;

describe('RunDto', () => {
  it('whitelist пайпа не режет вложенную статистику', async () => {
    const out = await run(body);
    expect(out.stats).toEqual(body.stats);
  });

  it('чужой исход и id не той формы — 400', async () => {
    await expect(run({ ...body, outcome: 'won' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(run({ ...body, id: 'Run-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(run({ ...body, fog: 9 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
