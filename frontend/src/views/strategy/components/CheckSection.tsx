'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { CHECK } from '../model/check';
import { fmtR } from '../model/format';

/** Чего отчёт сервера не считает: случайный вход, сверка с Binance, цена перебора. */
export function CheckSection() {
  const { binance, gross, previous } = CHECK;
  return (
    <section id="check" className="st-section">
      <SectionHead title="Насколько этому верить" />
      <p className="st-verdict">
        Это бектест, а не доказанная прибыль: стратегия не отправляет ордера, вперёд и живым счётом не проверялась.
      </p>
      <p className="muted">
        Снимок от {CHECK.date}. На свечах Binance с 2022 года эти правила дают {fmtR(binance.after)} на сделку за 2 года и{' '}
        {fmtR(binance.before)} за период до них; до комиссии — {fmtR(gross.after)} и {fmtR(gross.before)}. Стоп за часовым блоком
        узкий, около 1 %, и комиссия съедает перевес. Прежние правила — один вход по рынку и выход на +1,5 % — на тех же свечах
        давали {fmtR(previous.after)} и {fmtR(previous.before)}.
      </p>
      <p className="muted">
        Проскальзывание не учтено: 0,1 % на стопе срежет около {CHECK.slippageR.toLocaleString('ru-RU')}R с каждой сделки, закрытой
        стопом. Случайным входом эти правила не проверялись. Заранее записанный критерий — +0,15R и плюс на 3 монетах из 5 — не
        пройден.
      </p>
    </section>
  );
}
