'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';

/** Пункт-переключатель меню: у покера — справка по комбинациям. */
export interface MenuToggle {
  label: string;
  on: boolean;
  onToggle: () => void;
}

/**
 * Меню стола за «⋯»: ссылка на стол и переключатели, которые даёт игра.
 * Закрытия стола здесь нет — оно в строке «Мои столы» лобби: за столом идёт
 * игра, и необратимое действие рядом с ней лишнее.
 */
export function TableMenu({ toggles = [] }: { toggles?: MenuToggle[] }) {
  const t = useTranslations('cardTable');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  // Меню закрывается сразу, поэтому «скопировано» стоит рядом с кнопкой, а не
  // в самом пункте.
  const copy = () => {
    setOpen(false);
    void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true));
  };

  return (
    <div className="ct-menu" ref={ref}>
      {copied && (
        <span className="ct-note" role="status">
          {t('copied')}
        </span>
      )}
      <Button
        variant="none"
        className="ct-more"
        aria-label={t('menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </Button>
      {open && (
        <div className="ct-menu-list" role="menu">
          <Button variant="none" role="menuitem" className="ct-menu-item" onClick={copy}>
            {t('invite')}
          </Button>
          {toggles.map((x) => (
            <Button
              key={x.label}
              variant="none"
              role="menuitemcheckbox"
              aria-checked={x.on}
              className={cn('ct-menu-item', x.on && 'on')}
              onClick={() => {
                setOpen(false);
                x.onToggle();
              }}
            >
              {x.label}
              <span className="ct-dot" aria-hidden />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
