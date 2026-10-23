/**
 * Недельный шаблон плана дня владельца (раздел `admin.<домен>/plan`) — его
 * будни, как он их описал 2026-10-23. Дальше шаблон правится на странице;
 * скрипт нужен один раз, чтобы не вбивать девять блоков руками.
 *
 * Шаблон не пустой — отказ: затереть настроенное руками молча нельзя.
 * `--replace` — удалить прежний шаблон и будущие нетронутые дни.
 *
 * Прод: docker compose --env-file .env.prod -f docker-compose.prod.yml exec api node dist/scripts/seed-plan.js
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';

const WEEKDAYS = 0b0011111; // пн–пт
/** Ночь после будня: блок «после полуночи» лежит уже в следующем дне — вт–сб. */
const NIGHTS_AFTER_WEEKDAYS = 0b0111110;

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

interface Seed {
  days: number;
  from: string;
  to: string;
  title: string;
  category: string;
  /** Отслеживать: напоминание с кнопками и место в отчёте. Еду, отдых и сон — нет. */
  track: boolean;
  tasks?: string[];
}

export const TEMPLATE: Seed[] = [
  {
    days: WEEKDAYS,
    from: '08:45',
    to: '10:00',
    title: 'Подъём и сборы',
    category: 'life',
    track: false,
    tasks: ['Завтрак, гигиена, дорога на работу'],
  },
  {
    days: WEEKDAYS,
    from: '10:00',
    to: '16:00',
    title: 'Подработка + английский',
    category: 'work',
    track: false,
    tasks: [
      'Английский, чтение или карточки в свободные промежутки — без нормы по минутам',
    ],
  },
  {
    days: WEEKDAYS,
    from: '17:00',
    to: '17:45',
    title: 'Перезагрузка',
    category: 'rest',
    track: false,
    tasks: ['Дом, еда, отдых — без обязательных задач'],
  },
  {
    days: WEEKDAYS,
    from: '17:45',
    to: '19:45',
    title: 'Бэктесты',
    category: 'backtest',
    track: true,
    tasks: ['Главная задача дня', 'Уведомления и игры закрыты'],
  },
  {
    days: WEEKDAYS,
    from: '19:45',
    to: '20:30',
    title: 'Ужин и прогулка',
    category: 'rest',
    track: false,
    tasks: ['Отойти от монитора'],
  },
  {
    days: WEEKDAYS,
    from: '20:30',
    to: '22:00',
    title: 'Разработка или поиск работы',
    category: 'work',
    track: true,
  },
  {
    days: WEEKDAYS,
    from: '22:00',
    to: '22:30',
    title: 'Японский или английский',
    category: 'study',
    track: true,
  },
  {
    days: WEEKDAYS,
    from: '22:30',
    to: '24:00',
    title: 'Отдых: игры, Twitch, YouTube, сериал',
    category: 'rest',
    track: false,
    tasks: ['Свободное время без чувства вины'],
  },
  {
    days: NIGHTS_AFTER_WEEKDAYS,
    from: '00:00',
    to: '00:45',
    title: 'Подготовка ко сну',
    category: 'life',
    track: false,
    tasks: ['Спокойные занятия, затем сон'],
  },
];

/** Утренний план — к подъёму, отчёт — после последнего отслеживаемого блока. */
const SETTINGS = { morningMin: t('08:45'), eveningMin: t('22:35'), leadMin: 5 };

async function main() {
  const replace = process.argv.includes('--replace');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.planBlock.count();
    if (existing > 0 && !replace) {
      console.error(
        `В шаблоне уже ${existing} блоков — ничего не трогаю. Затереть: --replace`,
      );
      process.exitCode = 1;
      return;
    }
    await prisma.$transaction([
      prisma.planBlock.deleteMany({}),
      prisma.planBlock.createMany({
        data: TEMPLATE.map((b) => ({
          days: b.days,
          startMin: t(b.from),
          endMin: t(b.to),
          title: b.title,
          category: b.category,
          track: b.track,
          tasks: b.tasks ?? [],
        })),
      }),
      prisma.planSettings.upsert({
        where: { id: 1 },
        create: { id: 1, ...SETTINGS },
        update: SETTINGS,
      }),
    ]);
    // Сегодняшний день уже мог собраться из пустого шаблона — пересобираем
    // нетронутые и без единого ответа или напоминания: ответы — уже отчётность.
    const { tz } = await prisma.planSettings.findUniqueOrThrow({
      where: { id: 1 },
    });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
      new Date(),
    );
    const dropped = await prisma.planDay.deleteMany({
      where: {
        day: { gte: today },
        edited: false,
        items: {
          none: {
            OR: [{ status: { not: 'planned' } }, { notifiedAt: { not: null } }],
          },
        },
      },
    });
    console.log(
      `Шаблон: ${TEMPLATE.length} блоков; пересоберутся дней: ${dropped.count}; пояс ${tz}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
