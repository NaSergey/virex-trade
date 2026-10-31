'use client';

import { useState } from 'react';
import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { useStrategyReport } from './api/hooks';
import { fmtDateTime } from './model/format';
import { RulesSection } from './components/RulesSection';
import { BacktestSection } from './components/BacktestSection';
import { AuthorSection } from './components/AuthorSection';
import { CheckSection } from './components/CheckSection';
import { OddsSection } from './components/OddsSection';
import { LearningSection } from './components/LearningSection';
import { TheorySection } from './components/TheorySection';
import './strategy.css';

const VARIANT_OPTIONS = [
  { value: 'main', label: 'Цели от волатильности 4H' },
  { value: 'saved', label: 'Цель 5R (сохранённый)' },
];
const MAIN_NOTE =
  'Последний тейк — 4 ATR закрытой 4H-свечи от входа. Вход в средней трети диапазона 30 свечей 4H и цель ближе стопа — сделки нет.';
const SAVED_NOTE = 'Цель — ровно 5R от входа до стопа, положение входа в диапазоне не проверяется.';

const THEORY_KEY = 'virex.admin.strategy.theory';
const decodeTheory = (raw: string | null) => raw !== '0';
const encodeTheory = (on: boolean) => (on ? null : '0');

/**
 * Стратегия владельца: правила из видео, готовый отчёт бектеста на истории BTC,
 * проверка цифр автора, обучение на ошибках и — выключаемо — теория.
 * Право проверяет бэкенд (AdminGuard); isAdmin — чтобы не слать заведомый 403.
 */
export function StrategyPage() {
  const { user, loading } = useAuth();
  const q = useStrategyReport(!!user?.isAdmin);
  const [theory, setTheory] = usePersistentValue(THEORY_KEY, decodeTheory, true, encodeTheory);
  const [saved, setSaved] = useState(false);
  const full = q.data?.report ?? null;
  // Сохранённый вариант подменяет только свои разделы, цифры автора общие.
  const report = full && saved ? { ...full, ...full.saved } : full;
  // Без отчёта на странице только правила — якоря на пустые разделы не ставим.
  const anchors: [string, string][] = report
    ? [
        ['rules', 'Стратегия'],
        ['backtest', 'Бектест'],
        ['check', 'Другие монеты'],
        ['odds', 'Отбор сторон'],
        ['author', 'Цифры автора'],
        ['learning', 'Обучение'],
        ...(theory ? ([['theory', 'Теория']] as [string, string][]) : []),
      ]
    : [];

  return (
    <Wrap page>
      <PageHead
        title="Стратегия"
        lede={
          report
            ? `Интрадей Smart Money на истории BTC. Отчёт посчитан ${fmtDateTime(Date.parse(report.computedAt))} UTC, пересчитывается раз в сутки.`
            : 'Интрадей Smart Money на истории BTC: правила, бектест, проверка цифр автора и обучение на ошибках.'
        }
      >
        <Seg
          ariaLabel="Теория"
          options={[
            { value: 'on', label: 'С теорией' },
            { value: 'off', label: 'Без теории' },
          ]}
          value={theory ? 'on' : 'off'}
          onChange={(v) => setTheory(v === 'on')}
        />
      </PageHead>
      {anchors.length > 0 && (
        <nav className="st-anchors" aria-label="Разделы">
          {anchors.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      )}
      <RulesSection />
      <ErrorNote error={q.error} fallback="Отчёт не загрузился" />
      {loading || q.isLoading ? (
        <SkeletonLines />
      ) : report ? (
        <>
          <div className="st-variant">
            <Seg
              options={VARIANT_OPTIONS}
              value={saved ? 'saved' : 'main'}
              onChange={(v) => setSaved(v === 'saved')}
              ariaLabel="Вариант стратегии"
            />
            <span className="muted">{saved ? SAVED_NOTE : MAIN_NOTE}</span>
          </div>
          <BacktestSection report={report} theory={theory} />
          <CheckSection saved={saved} />
          <OddsSection block={report.odds} expectancy={report.main.stats.summary.expectancy} />
          <AuthorSection rows={report.author} />
          <LearningSection block={report.learning} />
          {theory && <TheorySection t={report.theory} />}
        </>
      ) : q.isError ? null : (
        <EmptyState title="Отчёт считается">
          {q.data?.computedAt
            ? `Правила изменились — отчёт пересчитывается. Прошлый расчёт — ${fmtDateTime(Date.parse(q.data.computedAt))} UTC.`
            : 'Первый расчёт идёт в фоне после запуска сервера; страница обновится сама.'}
        </EmptyState>
      )}
    </Wrap>
  );
}
