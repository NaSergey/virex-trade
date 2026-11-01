'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { CHECK } from '../model/check';
import { fmtPct, fmtR } from '../model/format';

/** Чего отчёт сервера не считает: случайный вход, сверка с Binance, цена перебора. */
export function CheckSection() {
  const { random, binance } = CHECK;
  return (
    <section id="check" className="st-section">
      <SectionHead title="Насколько этому верить" />
      <p className="st-verdict">
        Это бектест, а не доказанная прибыль: стратегия не отправляет ордера, вперёд и живым счётом не проверялась.
      </p>
      <p className="muted">
        Снимок от {CHECK.date}. Случайный вход с теми же монетами, сторонами, стопами и целью был не хуже стратегии в{' '}
        {fmtPct(random.after, 0)} из {random.runs} прогонов за 2 года и в {fmtPct(random.before, 0)} за период до них. На
        свечах Binance те же правила дают {fmtR(binance.after)} и {fmtR(binance.before)}.
      </p>
      <p className="muted">
        Проскальзывание не учтено: 0,1 % на входе по рынку и на стопе срежет около {CHECK.slippageR.toLocaleString('ru-RU')}R на
        сделку. Вариант выбран примерно из {CHECK.tried}, поэтому часть результата может быть удачей. Заранее записанный критерий
        он не прошёл: нужно было +0,15R и плюс на 3 монетах из 5.
      </p>
    </section>
  );
}
