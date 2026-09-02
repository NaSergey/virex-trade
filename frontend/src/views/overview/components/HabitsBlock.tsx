'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Habit, HabitsResponse } from '@/entities/trade';
import { Money } from '@/shared/ui/Money';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { habitAdvice, habitLabel, habitSearchParams, type TFunc } from '../lib/habit-labels';

/**
 * «Цена привычек»: то, что уже посчитано на бэкенде (HabitsService.scan) без
 * единого тега — отыгрыш, переторговка, время входа, контекст рынка — здесь
 * впервые доходит до пользователя. Место на Обзоре выбрано ровно за это:
 * первый экран, который видит человек, ещё не поставивший ни одного тега.
 *
 * Два списка, а не один: продукт ловит и на чём человек ошибается, и что он
 * делает правильно (CLAUDE.md) — «Работает» показывает подтверждённые плюсы
 * той же процедурой, что и «Дорого стоило» минусы.
 */
export function HabitsBlock({ data, isLoading }: { data?: HabitsResponse; isLoading: boolean }) {
  const t = useTranslations('overview');

  if (isLoading) {
    return (
      <div className="habits">
        <h2>{t('habitsTitle')}</h2>
        <SkeletonLines widths={[92, 78, 100, 64]} />
      </div>
    );
  }

  if (!data || data.status === 'need_more') {
    return (
      <div className="habits">
        <h2>{t('habitsTitle')}</h2>
        <EmptyState title={t('habitsNeedMoreTitle')}>
          {t('habitsNeedMoreBody', { positions: data?.positions ?? 0, need: data?.need ?? 0 })}
        </EmptyState>
      </div>
    );
  }

  const { habits, edges, totalCost } = data;
  const nothingFound = habits.length === 0 && edges.length === 0;

  return (
    <div className="habits">
      <div className="habits-head">
        <h2>{t('habitsTitle')}</h2>
        {totalCost !== 0 && <Money value={totalCost} large />}
      </div>

      {nothingFound ? (
        <p className="foot">{t('habitsNoneFound')}</p>
      ) : (
        <>
          {habits.length > 0 && (
            <div className="habit-group">
              <h3>{t('habitsCostly')}</h3>
              <HabitRows items={habits} t={t} />
            </div>
          )}
          {edges.length > 0 && (
            <div className="habit-group">
              <h3>{t('habitsWorking')}</h3>
              <HabitRows items={edges} t={t} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HabitRows({ items, t }: { items: Habit[]; t: TFunc }) {
  return (
    <div className="habit-list">
      {items.map((h) => {
        const qs = habitSearchParams(h.lab);
        const content = (
          <>
            <span
              className={`habit-conf ${h.confidence === 'confirmed' ? 'habit-conf-confirmed' : 'habit-conf-likely'}`}
              title={h.confidence === 'confirmed' ? t('habitsConfirmed') : t('habitsLikely')}
            />
            <span className="habit-label">
              <span className="habit-label-text">{habitLabel(h, t)}</span>
              <span className="habit-advice">{habitAdvice(h, t)}</span>
            </span>
            <Money value={h.cost} className="habit-cost" />
            <span className="habit-wr">
              {h.winRate.toFixed(0)} % / {h.winRateRest.toFixed(0)} %
            </span>
          </>
        );
        return qs ? (
          <Link key={h.key} href={`/analytics?${qs}`} className="habit-row habit-row-link">
            {content}
          </Link>
        ) : (
          <div key={h.key} className="habit-row">
            {content}
          </div>
        );
      })}
    </div>
  );
}
