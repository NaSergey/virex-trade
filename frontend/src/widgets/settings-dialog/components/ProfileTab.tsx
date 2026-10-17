'use client';

import { type ChangeEvent, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useAvatar, usePrivacy, useSetName, useSetPrivacy } from '@/entities/profile';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Input } from '@/shared/ui/Field';
import { ProfilePicture } from '@/shared/ui/ProfilePicture';
import { Skeleton } from '@/shared/ui/Skeleton';
import { toAvatarBlob } from '../lib/avatar-image';
import { Hint, Row, Section } from './Rows';

/**
 * Вкладка «Профиль»: блок игрока на две колонки (картинка слева, имя и показ
 * сделок справа) и пароль третьей колонкой. У каждой строки своё сохранение.
 * Демо-аккаунт общий: сервер не даёт менять ничего из этого (403
 * `ACCOUNT_DEMO_LOCKED`), а вкладка говорит это словами и выключает поля.
 */
export function ProfileTab({ locked }: { locked: boolean }) {
  const t = useTranslations('settings');
  return (
    <div className="stg-grid">
      {locked && <p className="stg-note">{t('demoLocked')}</p>}
      <div className="stg-col stg-span2">
        <Section title={t('playerTitle')}>
          <div className="stg-me">
            <AvatarPicker locked={locked} />
            <div className="stg-me-rows">
              <NameRow locked={locked} />
              <PrivacyRow locked={locked} />
            </div>
          </div>
        </Section>
      </div>
      <div className="stg-col">
        <PasswordSection locked={locked} />
      </div>
    </div>
  );
}

/**
 * Картинка: браузер режет её в квадрат 512×512 и жмёт в WebP (`toAvatarBlob`),
 * сервер принимает не больше 64 КБ. Новый адрес сразу уходит в шапку.
 *
 * Загрузка — клик по самой картинке, отдельной кнопки нет (владелец
 * 2026-10-17); полоса «Сменить» внизу картинки говорит, что она нажимается.
 * Подсказки про размер нет — строка под картинкой только у ошибки.
 */
function AvatarPicker({ locked }: { locked: boolean }) {
  const t = useTranslations('settings');
  const { user, setAvatar } = useAuth();
  const { upload, remove } = useAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [bad, setBad] = useState(false);
  const avatar = user?.avatar ?? null;
  const busy = upload.isPending || remove.isPending;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBad(false);
    const blob = await toAvatarBlob(file);
    if (!blob) {
      setBad(true);
      return;
    }
    // `mutateAsync`, а не колбэк `mutate`: тот молчит, если окно закрыли
    // раньше ответа, и шапка осталась бы со старой картинкой. Ошибку
    // показывает сама мутация.
    upload
      .mutateAsync(blob)
      .then((r) => setAvatar(r.avatar))
      .catch(() => {});
  };

  return (
    <div className="stg-me-ava">
      <Button
        variant="none"
        className="stg-ava"
        aria-label={t('avatarUpload')}
        aria-busy={busy}
        disabled={locked || busy}
        onClick={() => input.current?.click()}
      >
        <ProfilePicture src={avatar} />
        <span className="stg-ava-cue" aria-hidden>
          {t('avatarChange')}
        </span>
      </Button>
      {avatar && !locked && (
        <Button
          variant="bare"
          className="stg-ava-rm"
          disabled={busy}
          onClick={() =>
            remove
              .mutateAsync()
              .then(() => setAvatar(null))
              .catch(() => {})
          }
        >
          {t('avatarRemove')}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          // Тот же файл ещё раз — снова событие: иначе повторный выбор молчал бы.
          e.target.value = '';
        }}
      />
      {bad && <Hint error>{t('avatarBad')}</Hint>}
      <ErrorNote error={upload.error ?? remove.error} fallback={t('saveFailed')} />
    </div>
  );
}

/**
 * Имя: те же правила, что при регистрации, — 2–40 символов без пробелов по
 * краям. Сохранение — в самом поле: кнопка появляется, только когда имя
 * изменили (и Enter), а не висит серой плашкой всегда.
 */
function NameRow({ locked }: { locked: boolean }) {
  const t = useTranslations('settings');
  const id = useId();
  const { user, setName } = useAuth();
  const save = useSetName();
  const current = user?.name ?? '';
  const [name, setValue] = useState(current);
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 40;
  const changed = trimmed !== current;

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (locked || !valid || !changed || save.isPending) return;
          save
            .mutateAsync(trimmed)
            .then((r) => setName(r.name))
            .catch(() => {});
        }}
      >
        <Row label={t('nameTitle')} htmlFor={id}>
          <Input
            id={id}
            value={name}
            maxLength={40}
            disabled={locked}
            onChange={(e) => setValue(e.target.value)}
            full
          />
          {changed ? (
            <Button type="submit" variant="none" className="stg-inline" disabled={!valid || save.isPending}>
              {t('save')}
            </Button>
          ) : (
            save.isSuccess && <span className="stg-inline is-done">{t('saved')}</span>
          )}
        </Row>
      </form>
      {changed && !valid && <Hint error>{t('nameShort')}</Hint>}
      <ErrorNote error={save.error} fallback={t('saveFailed')} />
    </>
  );
}

/** Кто видит мои сделки — одна строка, без пояснений (владелец 2026-10-17). */
function PrivacyRow({ locked }: { locked: boolean }) {
  const t = useTranslations('settings');
  const id = useId();
  const { data, isLoading } = usePrivacy();
  const save = useSetPrivacy();
  // Пока запрос в полёте, показывается то, что человек нажал: галка,
  // отъезжающая назад на время запроса, читается как «не сработало».
  const on = save.isPending ? save.variables : (data?.showTrades ?? true);

  return (
    <>
      <Row label={t('privacyShowTrades')} htmlFor={id} className="is-flag">
        {isLoading ? (
          <Skeleton as="span" flush height={12} width={12} />
        ) : (
          <input
            id={id}
            type="checkbox"
            className="stg-check"
            checked={on}
            disabled={locked || save.isPending}
            onChange={(e) => save.mutate(e.target.checked)}
          />
        )}
      </Row>
      <ErrorNote error={save.error} fallback={t('privacyFailed')} />
    </>
  );
}

/**
 * Пароль: текущий, новый и повтор. Сервер снимает все сессии и выдаёт этому
 * устройству новую пару (`changePassword` в контексте авторизации). Короткий,
 * несовпадающий и тот же самый пароль ловятся здесь, до запроса.
 */
function PasswordSection({ locked }: { locked: boolean }) {
  const t = useTranslations('settings');
  const ids = { current: useId(), next: useId(), repeat: useId() };
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const change = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setRepeat('');
    },
  });

  // Новый ввод снимает «Пароль изменён» прошлой смены: иначе строка
  // возвращалась бы, стоило стереть набранное.
  const edit = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    if (change.isSuccess) change.reset();
    set(e.target.value);
  };

  const problem =
    next.length > 0 && next.length < 8
      ? t('passShort')
      : repeat.length > 0 && repeat !== next
        ? t('passMismatch')
        : next.length > 0 && next === current
          ? t('passSame')
          : null;
  const ready = current.length > 0 && next.length >= 8 && repeat === next && next !== current;

  const field = (key: keyof typeof ids, value: string, set: (v: string) => void, auto: string) => (
    <Input
      id={ids[key]}
      type="password"
      autoComplete={auto}
      value={value}
      disabled={locked}
      onChange={edit(set)}
      full
    />
  );

  return (
    <Section title={t('passTitle')}>
      <form
        className="stg-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !locked) change.mutate();
        }}
      >
        <Row label={t('passCurrent')} htmlFor={ids.current}>
          {field('current', current, setCurrent, 'current-password')}
        </Row>
        <Row label={t('passNext')} htmlFor={ids.next}>
          {field('next', next, setNext, 'new-password')}
        </Row>
        <Row label={t('passRepeat')} htmlFor={ids.repeat}>
          {field('repeat', repeat, setRepeat, 'new-password')}
        </Row>
        <Hint error={!!problem}>{problem ?? (change.isSuccess ? t('passDone') : t('passHint'))}</Hint>
        <Button
          type="submit"
          variant="solid"
          className="stg-wide"
          disabled={locked || !ready || change.isPending}
        >
          {t('passChange')}
        </Button>
      </form>
      <ErrorNote error={change.error} fallback={t('saveFailed')} />
    </Section>
  );
}
