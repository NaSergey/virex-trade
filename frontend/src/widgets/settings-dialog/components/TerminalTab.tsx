'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useTagPromptOn } from '@/widgets/backtest-session/model/useChartSettings';
import { Hint, Row, Section } from './Rows';

/** Вкладка «Терминал»: настройки поведения экрана; выбор хранится на устройстве. */
export function TerminalTab() {
  const t = useTranslations('settings');
  const id = useId();
  const [tagPrompt, setTagPrompt] = useTagPromptOn();
  return (
    <div className="stg-grid">
      <div className="stg-col">
        <Section title={t('termExpTitle')}>
          <Row label={t('termTagPrompt')} htmlFor={id} className="is-flag">
            <input
              id={id}
              type="checkbox"
              className="stg-check"
              checked={tagPrompt}
              onChange={(e) => setTagPrompt(e.target.checked)}
            />
          </Row>
          <Hint>{t('termTagPromptHint')}</Hint>
        </Section>
      </div>
    </div>
  );
}
