'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input, Select } from '@/shared/ui/Field';
import { PageHead } from '@/shared/ui/PageHead';
import { SectionHead } from '@/shared/ui/SectionHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePlanState, useSaveSettings, useTestMessage, type Settings } from './api/hooks';
import { hhmm, parseHHMM } from './model/time';
import { useDeviceTz } from './model/useDeviceTz';

const LEADS = [0, 5, 10, 15, 30];

/** Настройки плана: пояс, утро, вечер и за сколько напоминать. */
export function SettingsPage() {
  const state = usePlanState();
  if (!state.data) {
    return (
      <>
        <PageHead title="Настройки" />
        <ErrorNote error={state.error} fallback="Не удалось загрузить настройки" />
        <SkeletonLines widths={[60, 60, 60]} />
      </>
    );
  }
  return <Form initial={state.data.settings} telegram={state.data.telegram} />;
}

function Form({ initial, telegram }: { initial: Settings; telegram: boolean }) {
  const save = useSaveSettings();
  const test = useTestMessage();
  const [tz, setTz] = useState(initial.tz);
  const [morning, setMorning] = useState(initial.morningMin == null ? '' : hhmm(initial.morningMin));
  const [evening, setEvening] = useState(initial.eveningMin == null ? '' : hhmm(initial.eveningMin));
  const [lead, setLead] = useState(initial.leadMin);
  const device = useDeviceTz();

  const submit = () =>
    save.mutate({
      tz: tz.trim(),
      morningMin: parseHHMM(morning),
      eveningMin: parseHHMM(evening),
      leadMin: lead,
    });

  return (
    <>
      <PageHead title="Настройки" lede="Когда и что присылает бот" />
      <form
        className="pl-settings"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Часовой пояс">
          {(id) => (
            <div className="pl-inline">
              <Input id={id} full value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Moscow" />
              {device && device !== tz && (
                <Button variant="bare" tight onClick={() => setTz(device)}>
                  как у устройства: {device}
                </Button>
              )}
            </div>
          )}
        </Field>
        <Field label="Утренний план (пусто — не слать)">
          {(id) => <Input id={id} full type="time" value={morning} onChange={(e) => setMorning(e.target.value)} />}
        </Field>
        <Field label="Вечерний отчёт (в воскресенье — с неделей)">
          {(id) => <Input id={id} full type="time" value={evening} onChange={(e) => setEvening(e.target.value)} />}
        </Field>
        <Field label="Напоминать о блоке">
          {(id) => (
            <Select id={id} full value={lead} onChange={(e) => setLead(Number(e.target.value))}>
              {LEADS.map((l) => (
                <option key={l} value={l}>
                  {l === 0 ? 'в момент начала' : `за ${l} мин`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ErrorNote error={save.error} fallback="Не удалось сохранить" />
        <div className="pl-form-actions">
          {save.isSuccess && <span className="muted">Сохранено</span>}
          <span className="pl-grow" />
          <Button variant="solid" type="submit" disabled={save.isPending}>
            Сохранить
          </Button>
        </div>
      </form>

      <SectionHead title="Telegram" />
      {telegram ? (
        <p className="pl-note">
          Бот привязан. В чате: <code>/plan</code> — план на сегодня, <code>/report</code> — итог дня,{' '}
          <code>/week</code> — неделя.
        </p>
      ) : (
        <p className="pl-notice">Бот не привязан: основной сайт → «Настройки» → Telegram.</p>
      )}
      <div className="pl-foot">
        <Button disabled={!telegram || test.isPending} onClick={() => test.mutate()}>
          Прислать проверку
        </Button>
        {test.isSuccess && <span className="muted">Отправлено</span>}
        <ErrorNote as="span" error={test.error} fallback="Не дошло" />
      </div>
    </>
  );
}
