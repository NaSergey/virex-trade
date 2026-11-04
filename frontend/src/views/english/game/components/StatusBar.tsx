'use client';

import { useState } from 'react';
import { Coins, Flame, Heart, Menu, Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils/css';
import { CHARACTERS } from '../content/characters';
import { ITEMS, RELICS } from '../content/relics';
import { WEATHER } from '../content/weather';
import { comboMult } from '../model/combat';
import type { Action, RunState } from '../model/engine';
import { setSoundOn, soundOn } from '../sound';

type Dispatch = (a: Action) => void;

const mult = (x: number) => `×${x.toFixed(1).replace('.', ',')}`;

/**
 * Панель забега: здоровье, серия, шиллинги и меню — одной строкой над любым
 * экраном; под ней карман (предметы — одно касание). Всё остальное — в меню.
 */
export function StatusBar({
  run,
  dispatch,
  voice,
}: {
  run: RunState;
  dispatch: Dispatch;
  voice: { on: boolean; set: (on: boolean) => void } | null;
}) {
  const [menu, setMenu] = useState(false);
  const [sound, setSound] = useState(soundOn);
  const [quitting, setQuitting] = useState(false);
  const low = run.hp / run.maxHp <= 0.3;
  const m = comboMult(run.combo, run.relics, run.weather);
  const dictionary = run.relics.includes('dictionary') && run.screen.kind === 'fight';

  const close = () => {
    setMenu(false);
    setQuitting(false);
  };

  return (
    <>
      <div className="eg-status">
        <div className="eg-hud">
          <div className={cn('eg-hp', low && 'eg-hp-low')} aria-label={`Здоровье ${run.hp} из ${run.maxHp}`}>
            <span key={`hp${run.hp}`} className="eg-hp-ic eg-bump">
              <Heart size={16} aria-hidden />
            </span>
            <div className="eg-hp-bar">
              <i style={{ transform: `scaleX(${run.hp / run.maxHp})` }} />
              <span>
                {run.hp}/{run.maxHp}
              </span>
            </div>
          </div>
          <span
            key={`c${run.combo}`}
            className={cn('eg-chip', run.combo > 0 && 'eg-chip-hot eg-bump')}
            title="Серия верных подряд — множитель урона"
          >
            <Flame size={14} aria-hidden /> {run.combo > 0 ? mult(m) : '×1'}
          </span>
          <span key={`m${run.coins}`} className="eg-chip eg-chip-gold eg-bump" title="Шиллинги">
            <Coins size={14} aria-hidden /> {run.coins}
          </span>
          <Button variant="none" className="eg-icon-btn" onClick={() => setMenu(true)} aria-label="Меню" aria-expanded={menu}>
            <Menu size={20} aria-hidden />
          </Button>
        </div>

        {run.items.length > 0 || dictionary ? (
          <div className="eg-pocket">
            {run.items.map((item, i) => (
              <Button
                key={`${item}${i}`}
                variant="none"
                className="eg-pocket-item"
                title={ITEMS[item].text}
                onClick={() => dispatch({ type: 'item', index: i, now: Date.now() })}
              >
                {ITEMS[item].name}
              </Button>
            ))}
            {dictionary ? (
              <Button variant="none" className="eg-pocket-item" onClick={() => dispatch({ type: 'hint', now: Date.now() })}>
                Словарь
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* Меню — вне строки: та липкая, и внутри неё слой меню оказался бы под панелью вкладок. */}
      {menu ? (
        <div className="eg-menu-back" onClick={close}>
          <div className="eg-menu" role="dialog" aria-label="Пауза" onClick={(e) => e.stopPropagation()}>
            <div className="eg-menu-head">
              <b>Пауза</b>
              <Button variant="none" className="eg-icon-btn" onClick={close} aria-label="Закрыть">
                <X size={20} aria-hidden />
              </Button>
            </div>
            <div className="eg-menu-toggles">
              <Button
                variant="none"
                className="eg-toggle"
                aria-pressed={sound}
                onClick={() => {
                  setSoundOn(!sound);
                  setSound(!sound);
                }}
              >
                {sound ? <Volume2 size={20} aria-hidden /> : <VolumeX size={20} aria-hidden />}
                <span>Звук</span>
                <small>{sound ? 'вкл' : 'выкл'}</small>
              </Button>
              {voice ? (
                <Button variant="none" className="eg-toggle" aria-pressed={voice.on} onClick={() => voice.set(!voice.on)}>
                  {voice.on ? <Mic size={20} aria-hidden /> : <MicOff size={20} aria-hidden />}
                  <span>Отвечать голосом</span>
                  <small>{voice.on ? 'да' : 'нет'}</small>
                </Button>
              ) : null}
            </div>
            <ul className="eg-menu-list">
              {run.relics.map((id) => (
                <li key={id}>
                  <b>{RELICS[id].name}</b>
                  <span>{RELICS[id].text}</span>
                </li>
              ))}
              <li>
                <b>{CHARACTERS[run.character].name}</b>
                <span>{CHARACTERS[run.character].perk}</span>
              </li>
              <li>
                <b>{WEATHER[run.weather].name}</b>
                <span>{WEATHER[run.weather].text}</span>
              </li>
            </ul>
            <div className="eg-menu-actions">
              <Button variant="solid" onClick={close}>
                Продолжить
              </Button>
              <Button variant="risk" onClick={() => (quitting ? dispatch({ type: 'quit', now: Date.now() }) : setQuitting(true))}>
                {quitting ? 'Точно сдаться?' : 'Сдаться'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
