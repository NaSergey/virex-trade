export interface ReportTrade {
  closedPnl: number;
  stopLoss: number | null;
  tagNames: string[];
}

export interface WeekRange {
  from: Date;
  to: Date;
}

const WEEK_MS = 7 * 24 * 3_600_000;

/** Прошедшие понедельник–воскресенье относительно момента отправки. */
export const lastWeekRange = (now: Date): WeekRange => {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  return { from: new Date(to.getTime() - WEEK_MS), to };
};

const money = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

/**
 * PnL по тегам не делится между тегами: сделка целиком засчитывается каждому
 * своему тегу — то же правило, что в statsByTag. Деление поровну обессмыслило
 * бы число, а «лучший тег» превратило бы в «тег, который реже ходит в паре».
 */
const byTag = (trades: ReportTrade[]): Array<{ name: string; pnl: number }> => {
  const sums = new Map<string, number>();
  for (const t of trades) {
    for (const name of t.tagNames) sums.set(name, (sums.get(name) ?? 0) + t.closedPnl);
  }
  return [...sums.entries()]
    .map(([name, pnl]) => ({ name, pnl }))
    .sort((a, b) => b.pnl - a.pnl);
};

export const buildWeeklyReport = (current: ReportTrade[], previous: ReportTrade[]): string => {
  if (current.length === 0) {
    return ['🗓 <b>Итоги недели</b>', '', 'Сделок за неделю не было.'].join('\n');
  }

  const pnl = current.reduce((s, t) => s + t.closedPnl, 0);
  const wins = current.filter((t) => t.closedPnl > 0).length;
  const winRate = Math.round((wins / current.length) * 100);
  const withStop = current.filter((t) => t.stopLoss != null).length;
  const stopShare = Math.round((withStop / current.length) * 100);
  const tags = byTag(current);

  const lines = [
    '🗓 <b>Итоги недели</b>',
    '',
    `Результат: <b>${money(pnl)}</b>`,
    `Сделок: ${current.length} · Винрейт: ${winRate}%`,
    `Со стопом на входе: ${stopShare}%`,
  ];

  if (tags.length > 0) {
    lines.push('', `Лучший тег: ${tags[0].name} (${money(tags[0].pnl)})`);
    // Худший показываем, только если он не тот же самый: у одного тега за
    // неделю «лучший и худший — один и тот же» читается как насмешка.
    if (tags.length > 1) {
      const worst = tags[tags.length - 1];
      lines.push(`Худший тег: ${worst.name} (${money(worst.pnl)})`);
    }
  }

  if (previous.length > 0) {
    const prevPnl = previous.reduce((s, t) => s + t.closedPnl, 0);
    lines.push('', `Неделей раньше: ${money(prevPnl)} на ${previous.length} сделках`);
  }

  return lines.join('\n');
};
