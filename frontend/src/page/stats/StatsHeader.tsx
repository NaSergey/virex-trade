'use client';

import { useState } from 'react';
import { ChevronDown, CalendarDays, RefreshCw, X } from 'lucide-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { PERIODS } from './usePeriodFilter';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Пилюля «своя дата». Обычный видимый `<input type="date">` — просто печатаешь
 * дату цифрами. Без принудительного showPicker() по клику: он открывал
 * календарь при каждом клике в поле, даже когда клик был просто «поставить
 * курсор перед вводом» — окно всплывало не по делу. Нативная иконка календаря
 * у поля никуда не делась, кто хочет выбрать дату мышкой — кликает по ней.
 */
function CustomDatePicker({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  return (
    <div
      title="Свой период — фильтр с выбранной даты по сегодня"
      className={`sheen inline-flex items-center gap-1.5 rounded-lg border pl-2.5 pr-1.5 py-1.5 text-xs font-medium transition-colors ${
        value ? 'border-line-strong bg-elevated-2 text-fg' : 'border-line bg-elevated text-muted'
      }`}
    >
      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
      <input
        type="date"
        value={value ?? ''}
        max={todayIso()}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-28 cursor-text scheme-dark border-0 bg-transparent p-0 text-xs font-medium text-inherit outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Сбросить свою дату"
          className="cursor-pointer text-muted transition-colors hover:text-fg"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Пресеты периода (7/30/90/всё) + своя дата — вынесено из StatsHeader, чтобы
 * тот же блок мог встать и в Лабораторию: там раньше был свой, более бедный
 * набор пресетов без своей даты.
 */
export function PeriodFilterControls({
  days,
  customDate,
  onSelectDays,
  onCustomDate,
}: {
  days: number;
  customDate: string | null;
  onSelectDays: (d: number) => void;
  onCustomDate: (iso: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <SegmentedControl options={PERIODS} value={customDate ? -1 : days} onChange={onSelectDays} size="sm" />
      <CustomDatePicker value={customDate} onChange={onCustomDate} />
    </div>
  );
}

/**
 * Шапка страниц статистики (Обзор/Теги): заголовок + пресеты периода, своя
 * дата, символ (декоративно) и ручной sync. Общая для обеих страниц — раньше
 * это была одна шапка над вкладками одной страницы, теперь каждая страница
 * своя, но фильтр периода и его контролы те же.
 */
export function StatsHeader({
  title,
  days,
  customDate,
  onSelectDays,
  onCustomDate,
}: {
  title: string;
  days: number;
  customDate: string | null;
  onSelectDays: (d: number) => void;
  onCustomDate: (iso: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
      <h1 className="text-sm font-semibold text-fg">{title}</h1>
      <PeriodFilterControls days={days} customDate={customDate} onSelectDays={onSelectDays} onCustomDate={onCustomDate} />
    </div>
  );
}
