/**
 * Разовый бэкфилл: пять новых дефолтных тегов (Divergence, FVG, Order Block,
 * BOS, Liquidity Grab — см. `TagsService.DEFAULT_TAGS`) добавлены в реестр
 * уже после того, как часть аккаунтов зарегистрировалась и получила старые
 * девять. Без этого скрипта новые теги увидели бы только будущие регистрации.
 *
 * Идёт по всем пользователям и вставляет только отсутствующие из пятёрки
 * (`skipDuplicates` на уникальном `(userId, name)`) — у кого тег с таким
 * именем уже есть, запись пропускается, а не дублируется и не перезаписывается.
 * Идемпотентен: повторный запуск ничего не добавит второй раз.
 *
 * Запуск локально:
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-smc-tags.ts
 * На проде:
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec api node dist/scripts/backfill-smc-tags.js
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';

const NEW_TAGS: Array<{ name: string; type: string }> = [
  { name: 'Divergence', type: 'setup' },
  { name: 'FVG', type: 'setup' },
  { name: 'Order Block', type: 'setup' },
  { name: 'BOS', type: 'setup' },
  { name: 'Liquidity Grab', type: 'setup' },
];

// Та же палитра, что PALETTE в tags.service.ts — совпадать один в один со
// старыми тегами пользователя не обязана, важно не повторить цвет внутри
// вставляемой пятёрки.
const PALETTE = [
  '#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4',
  '#ec4899', '#a855f7', '#84cc16', '#14b8a6', '#f97316',
  '#0ea5e9', '#eab308', '#f43f5e', '#8b5cf6', '#64748b',
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    let inserted = 0;
    for (const user of users) {
      const used = new Set(
        (await prisma.tag.findMany({ where: { userId: user.id }, select: { color: true } })).map((t) => t.color),
      );
      const available = PALETTE.filter((c) => !used.has(c));
      const pool = available.length >= NEW_TAGS.length ? available : PALETTE;
      const rows = NEW_TAGS.map((t, i) => ({
        userId: user.id,
        name: t.name,
        type: t.type,
        color: pool[i % pool.length],
      }));
      const res = await prisma.tag.createMany({ data: rows, skipDuplicates: true });
      inserted += res.count;
    }
    console.log(`Добавлено тегов: ${inserted} (пользователей всего: ${users.length})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
