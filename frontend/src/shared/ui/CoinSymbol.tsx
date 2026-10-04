'use client';

import { useTranslations } from 'next-intl';
import { Button } from './Button';

/**
 * Символ монеты в строке таблицы. С `onPick` — кнопка «открыть эту монету на
 * графике» (терминал, где монет несколько), без него — просто текст, как на
 * обзоре и в журнале.
 *
 * Нажатие не всплывает к строке: строка истории раскрывается по клику, и
 * переход к графику не должен заодно её разворачивать.
 */
export function CoinSymbol({ symbol, onPick }: { symbol: string; onPick?: (symbol: string) => void }) {
  const t = useTranslations('common');
  if (!onPick) return <span className="sym">{symbol}</span>;
  return (
    <Button
      variant="none"
      className="sym sym-pick"
      title={t('openOnChart')}
      onClick={(e) => {
        e.stopPropagation();
        onPick(symbol);
      }}
    >
      {symbol}
    </Button>
  );
}
