'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { dateFormat } from '@/shared/lib/utils/intl';
import { SECTION_BY_ID } from '../../content';
import { doneLessons } from '../../model/today';

const SHOWN = 12;

/** Пройденные уроки: дата отметки и название, свежие сверху. */
export function DoneLessons({ dates }: { dates: ReadonlyMap<string, number> }) {
  const [all, setAll] = useState(false);
  const rows = doneLessons(dates).filter((r) => SECTION_BY_ID.has(r.id));
  if (rows.length === 0) {
    return <EmptyState title="Пока ни одного урока">Отметь раздел пройденным на странице урока.</EmptyState>;
  }
  const shown = all ? rows : rows.slice(0, SHOWN);
  const fmt = dateFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <>
      <ul className="en-done">
        {shown.map(({ id, at }) => (
          <li key={id}>
            <Link href={`/english/lessons?s=${id}`} className="en-done-row">
              <span className="muted en-done-date">{fmt.format(new Date(at)).replace(' г.', '')}</span>
              <span>{SECTION_BY_ID.get(id)!.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && !all ? (
        <Button className="en-done-more" onClick={() => setAll(true)}>
          Показать все · {rows.length}
        </Button>
      ) : null}
    </>
  );
}
