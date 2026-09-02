'use client';

import { useTranslations } from 'next-intl';
import type { AdminOverview } from '../api/hooks';

/**
 * Путь, которым продукт считается пройденным: регистрация → ключи биржи → свои
 * сделки → первый тег → первый срез статистики (см. CLAUDE.md, «Готовность»).
 *
 * Ступени — не «фичи, которыми пользуются», а места, где человек уходит.
 * Поэтому у каждой строки показано и число, и доля от регистраций: сама по себе
 * «4» не говорит, много это или почти никто.
 *
 * Считается за всё время, а не за окно отчёта: подключивший ключи полгода назад
 * ступень прошёл, и обнулять её выбором периода было бы неправдой. Отдельно от
 * лестницы стоит «вернулись на другой день» — это не ступень пути, а ответ на
 * тот же вопрос с другой стороны.
 */
export function Funnel({ funnel }: { funnel: AdminOverview['funnel'] }) {
  const t = useTranslations('admin');
  const base = funnel.registered || 1;

  const steps: { key: string; label: string; value: number }[] = [
    { key: 'registered', label: t('fRegistered'), value: funnel.registered },
    { key: 'connected', label: t('fConnected'), value: funnel.connectedExchange },
    { key: 'trades', label: t('fTrades'), value: funnel.syncedTrades },
    { key: 'tag', label: t('fTag'), value: funnel.createdTag },
    { key: 'tagged', label: t('fTagged'), value: funnel.taggedSomething },
    { key: 'stats', label: t('fStats'), value: funnel.readStats },
  ];

  return (
    <div className="fnl">
      {steps.map((step) => (
        <div className="fnl-r" key={step.key}>
          <span className="lbl">{step.label}</span>
          <span className="n">
            {step.value}
            <span className="muted"> · {Math.round((step.value / base) * 100)} %</span>
          </span>
          <span className="fnl-b">
            <i className="fnl-f" style={{ width: `${(step.value / base) * 100}%` }} />
          </span>
        </div>
      ))}

      <div className="fnl-r" style={{ marginTop: 'var(--s2)' }}>
        <span className="lbl">{t('fReturned')}</span>
        <span className="n">{funnel.returnedAnotherDay}</span>
      </div>
    </div>
  );
}
