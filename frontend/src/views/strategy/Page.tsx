'use client';

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
import { LearningSection } from './components/LearningSection';
import { TheorySection } from './components/TheorySection';
import './strategy.css';

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
  const report = q.data?.report ?? null;
  // Без отчёта на странице только правила — якоря на пустые разделы не ставим.
  const anchors: [string, string][] = report
    ? [
        ['rules', 'Стратегия'],
        ['backtest', 'Бектест'],
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
          <BacktestSection report={report} />
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
