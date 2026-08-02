/**
 * Прогон «Цены привычек» по локальной БД, без сервера и авторизации.
 *
 *   npx ts-node scripts/habits-report.ts [days] [tzOffsetMin]
 *
 * days: 0 или пусто — вся история. tzOffsetMin — как Date.getTimezoneOffset()
 * на клиенте (Москва = -180). Печатает найденные срезы по каждому пользователю.
 */
import { PrismaClient } from '@prisma/client';
import { HabitsService } from '../src/trades/habits.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const showAll = process.argv.includes('--all');
const days = Number(args[0] ?? 0) || undefined;
const tz = Number(args[1] ?? -180);

const money = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

async function main() {
  const prisma = new PrismaClient();
  const service = new HabitsService(prisma as unknown as PrismaService);

  const users = await prisma.user.findMany({
    select: { id: true, email: true, _count: { select: { trades: true } } },
  });

  for (const u of users) {
    if (u._count.trades === 0) continue;
    console.log(`\n═══ ${u.email} — ${u._count.trades} строк сделок ═══`);
    const res = await service.scan(u.id, days, tz, { includeAll: showAll });

    if (res.status === 'need_more') {
      console.log(`Мало данных: ${res.positions} позиций из ${res.need}.`);
      continue;
    }

    console.log(
      `Позиций: ${res.positions} · проверено гипотез: ${res.tested} · ` +
        `цена подтверждённых привычек: ${money(res.totalCost)}`,
    );

    const table = (title: string, list: typeof res.habits) => {
      console.log(`\n${title} (${list.length})`);
      if (!list.length) return console.log('  —');
      console.log(
        '  ' +
          pad('срез', 44) +
          pad('цена', 12) +
          pad('n', 5) +
          pad('ср. сделка', 12) +
          pad('vs остальные', 14) +
          pad('p', 8) +
          pad('уверенность', 13) +
          'oos',
      );
      for (const h of list) {
        console.log(
          '  ' +
            pad(h.label, 44) +
            pad(money(h.cost), 12) +
            pad(String(h.n), 5) +
            pad(money(h.avgPnl), 12) +
            pad(money(h.avgRest), 14) +
            pad(h.p.toFixed(4), 8) +
            pad(h.confidence === 'confirmed' ? 'подтверждено' : 'похоже', 13) +
            (h.oos === 'pass' ? '✓' : h.oos === 'fail' ? '✗' : '·') +
            (h.outlierSafe ? '' : '  ⚠ одна сделка'),
        );
      }
    };

    table('СТОИЛО ДЕНЕГ', res.habits);
    table('ПРИНОСИЛО ДЕНЬГИ', res.edges);
    if (showAll) table('ВСЕ ПРОВЕРЕННЫЕ СРЕЗЫ (диагностика, значимость не учтена)', res.all);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
