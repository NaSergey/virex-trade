'use client';

import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Field';
import { cn } from '@/shared/lib/utils/css';
import type { DeckCard, Status, UserTheme } from '../../model/deck';
import { Say } from '../Say';

const STATUS_LABEL: Record<Status, string> = { new: 'новое', learning: 'изучаю', known: 'знаю' };

/**
 * Строка словаря. На телефоне — карточка: слово с озвучкой и статусом сверху,
 * перевод ниже, действия рядом кнопками в рост пальца.
 */
export function WordRow({
  card,
  status,
  themes,
  fromTheme,
  onKnow,
  onRelearn,
  onToTheme,
  onOutOfTheme,
}: {
  card: DeckCard;
  status: Status;
  /** Свои темы — в какую можно положить слово. */
  themes: readonly UserTheme[];
  /** Выбрана своя тема — вместо «В тему» кнопка «Убрать из темы». */
  fromTheme: boolean;
  onKnow: (card: DeckCard) => void;
  onRelearn: (card: DeckCard) => void;
  onToTheme: (card: DeckCard, themeId: string) => void;
  onOutOfTheme: (card: DeckCard) => void;
}) {
  return (
    <li className="en-w">
      <span className="en-w-word en-phrase">
        <span lang="en">{card.en}</span>
        <Say text={card.en} />
      </span>
      <span className="en-w-ru">{card.ru}</span>
      <span className={cn('en-w-status', status === 'known' ? 'pos' : 'muted')}>{STATUS_LABEL[status]}</span>
      <span className="en-w-act">
        {status === 'known' ? (
          <Button onClick={() => onRelearn(card)}>Учить снова</Button>
        ) : (
          <Button onClick={() => onKnow(card)}>Знаю</Button>
        )}
        {fromTheme ? (
          <Button onClick={() => onOutOfTheme(card)}>Убрать из темы</Button>
        ) : themes.length > 0 ? (
          <Select
            aria-label={`Положить «${card.en}» в тему`}
            value=""
            onChange={(e) => e.target.value && onToTheme(card, e.target.value)}
          >
            <option value="">В тему…</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        ) : null}
      </span>
    </li>
  );
}
