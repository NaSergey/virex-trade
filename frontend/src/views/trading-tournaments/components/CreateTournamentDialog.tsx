'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import { useCreateTournament, type TournamentVisibility } from '@/entities/tournament';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, FieldGroup, Input, Select } from '@/shared/ui/Field';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { defaultShares, sharesValid } from '../model/payout-shares';

const DURATIONS = [60, 240, 1440, 4320, 10080] as const;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

/**
 * Новый турнир — окно, а не колонка на странице. Создают турнир редко, а
 * читают списки постоянно: пока форма стояла справа от них, треть листа на
 * каждом заходе занимали одиннадцать полей, которые в этот раз никому не
 * нужны. Теперь на их месте лидерборд, а форма открывается кнопкой у
 * заголовка.
 *
 * Окно — в игровом тоне (`tone="game"`), как и окно самого турнира: его
 * открывают с чёрной витрины, и белый лист поверх неё читался бы чужой
 * страницей. Заодно форма и результат выглядят одним предметом — у обоих окон
 * одна шапка с фондом справа, и фонд здесь живой: он и есть то, ради чего
 * заполняют остальные поля.
 *
 * Поля собраны в три группы — условия, ставки, призы, — а не идут одним столбцом
 * в одиннадцать строк: столбец не различал «что за турнир», «сколько это
 * стоит» и «кому сколько достанется», и название турнира весило в нём столько
 * же, сколько доля третьего места.
 *
 * Дуэль и общий турнир — не разные сущности, а разные значения тех же полей:
 * два места, один победитель и доля в сто процентов — это и есть дуэль.
 *
 * Доли по местам подставляются готовыми (см. `defaultShares`) и правятся
 * руками: начинать с пустых полей значило бы заставить создателя решать
 * арифметику «чтобы вышло сто» раньше, чем он подумал о турнире.
 */
export function CreateTournamentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Созданный турнир открывается тем же окном, что и турнир из списка. */
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const create = useCreateTournament();
  const { data: coins } = useCoinBalance();

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<TournamentVisibility>('private');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [deposit, setDeposit] = useState('10000');
  const [durationMin, setDurationMin] = useState<number>(240);
  const [entryFee, setEntryFee] = useState('100');
  const [prizeBonus, setPrizeBonus] = useState('0');
  const [winnersCount, setWinnersCount] = useState(1);
  const [shares, setShares] = useState<number[]>(() => defaultShares(1));

  const visibilityOptions: SegOption<TournamentVisibility>[] = [
    { value: 'private', label: t('visibilityPrivate') },
    { value: 'public', label: t('visibilityPublic') },
  ];
  const durationOptions: SegOption<number>[] = DURATIONS.map((m) => ({ value: m, label: t(`duration.${m}`) }));

  const depositN = Number(deposit);
  const feeN = Number(entryFee);
  const bonusN = Number(prizeBonus);
  const numbersOk =
    Number.isInteger(feeN) &&
    feeN >= 0 &&
    Number.isInteger(bonusN) &&
    bonusN >= 0 &&
    depositN >= 100 &&
    depositN <= 10_000_000;
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60;
  const sharesOk = sharesValid(shares, winnersCount);
  const valid = nameOk && numbersOk && sharesOk && winnersCount < maxPlayers;

  // Что создатель платит прямо сейчас: свой взнос и добавку в фонд.
  const dueNow = (numbersOk ? feeN : 0) + (numbersOk ? bonusN : 0);
  const notEnough = coins != null && dueNow > coins.balance;
  // Фонд при полном наборе мест — сколько турнир обещает, а не сколько собрал.
  const poolFull = numbersOk ? feeN * maxPlayers + bonusN : 0;

  // Мест стало меньше числа победителей — подвинуть победителей, иначе форма
  // молча оставалась бы невалидной без видимой причины.
  const applyMaxPlayers = (n: number) => {
    setMaxPlayers(n);
    if (winnersCount >= n) applyWinners(n - 1);
  };
  const applyWinners = (n: number) => {
    setWinnersCount(n);
    setShares(defaultShares(n));
  };

  const submit = () =>
    create.mutate(
      {
        name: name.trim(),
        visibility,
        maxPlayers,
        startBalance: depositN,
        durationMin,
        entryFee: feeN,
        prizeBonus: bonusN,
        winnersCount,
        payoutShares: shares,
      },
      {
        // Окно создания уходит само: на его месте открывается окно созданного
        // турнира, и два листа друг на друге читались бы так, будто форма не
        // сработала. Сначала закрытие, потом открытие — `onCreated` ещё ждёт
        // данные турнира (см. useTournamentOpener), и форма успевает уйти.
        onSuccess: (r) => {
          onClose();
          onCreated(r.tournament.id);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent tone="game">
        {/* Фонд справа от заголовка — тот же узел, что и у готового турнира
            (`.tpool`): пока форму заполняют, число растёт на глазах, и «мест
            больше» читается как «фонд больше», а не как строка в анкете. */}
        <DialogHeader
          title={t('createTitle')}
          subtitle={t('createLead')}
          aside={
            <>
              <span className="tpool">
                {poolFull} <span className="tpool-unit">{tc('unit')}</span>
              </span>
              <span className="tpool-sub">{t('poolFullHint')}</span>
            </>
          }
        />
        <DialogBody>
          <Field label={t('nameLabel')}>
            {(id) => <Input id={id} full value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
          </Field>

          {/* Без видимой подписи и пояснения под тумблером: «Закрытый» /
              «Публичный» называют себя сами, и подпись группы над двумя
              словами того же смысла — просто их пересказ. Название группы
              остаётся `aria-label`'ом у `Seg` — скринридеру есть что читать.
              Обёртка `.field` нужна не ради подписи (её здесь нет), а ради
              деления кнопок пополам — это её `.field .seg button` растягивает
              «Закрытый» и «Публичный» на равные половины тумблера. */}
          <div className="field">
            <Seg
              options={visibilityOptions}
              value={visibility}
              onChange={setVisibility}
              ariaLabel={t('visibilityLabel')}
            />
          </div>

          <div className="fsect">
            <span className="lbl fsect-head">{t('groupSetup')}</span>
            <div className="fgrid">
              <Field label={t('playersLabel')}>
                {(id) => (
                  <Select id={id} full value={maxPlayers} onChange={(e) => applyMaxPlayers(Number(e.target.value))}>
                    {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
                      <option key={n} value={n}>
                        {n === 2 ? t('playersDuel') : t('playersN', { n })}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t('depositLabel')}>
                {(id) => (
                  <Input
                    id={id}
                    full
                    suffix="USDT"
                    inputMode="decimal"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                  />
                )}
              </Field>
            </div>

            <FieldGroup label={t('durationLabel')}>
              <Seg
                options={durationOptions}
                value={durationMin}
                onChange={setDurationMin}
                ariaLabel={t('durationLabel')}
              />
            </FieldGroup>
          </div>

          <div className="fsect">
            <span className="lbl fsect-head">{t('groupStakes')}</span>
            <div className="fgrid">
              <Field label={t('entryFeeLabel')}>
                {(id) => (
                  <Input
                    id={id}
                    full
                    suffix={tc('unit')}
                    inputMode="numeric"
                    value={entryFee}
                    onChange={(e) => setEntryFee(e.target.value)}
                  />
                )}
              </Field>

              <Field label={t('prizeBonusLabel')}>
                {(id) => (
                  <Input
                    id={id}
                    full
                    suffix={tc('unit')}
                    inputMode="numeric"
                    value={prizeBonus}
                    onChange={(e) => setPrizeBonus(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {/* Своя плата стоит под своими же полями: взнос и добавку создатель
                платит сам, и узнать об этом он должен там, где их вводит, а не
                строкой над кнопкой, которая уже заблокирована. */}
            <p className={notEnough ? 'fhint neg' : 'fhint'}>
              {notEnough
                ? t('notEnoughCoins', { n: dueNow, unit: tc('unit') })
                : t('dueNow', { n: dueNow, unit: tc('unit') })}
            </p>
          </div>

          <div className="fsect">
            <span className="lbl fsect-head">{t('groupPrizes')}</span>
            <div className="fgrid">
              <Field label={t('winnersLabel')}>
                {(id) => (
                  <Select id={id} full value={winnersCount} onChange={(e) => applyWinners(Number(e.target.value))}>
                    {Array.from({ length: maxPlayers - 1 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <FieldGroup label={t('sharesLabel')}>
                {/* Один победитель — один взгляд на цифру, и подпись места над
                    ней лишняя (100% и так значит «единственное»): та же логика,
                    по которой шапка турнира заменяет разбивку по местам
                    словом `winnerSingle`, когда мест для дележа нет. Ряд из
                    одного контрола выравнивается с выбором числа победителей
                    слева — оба одной высоты, «подпись → контрол». */}
                {shares.length === 1 ? (
                  <Input
                    full
                    suffix="%"
                    inputMode="numeric"
                    value={String(shares[0])}
                    onChange={(e) => setShares([Number(e.target.value.replace(/\D/g, '')) || 0])}
                  />
                ) : (
                  <div className="shares">
                    {shares.map((share, i) => (
                      <label key={i} className="share">
                        <span className="lbl">{t('placeN', { n: i + 1 })}</span>
                        <Input
                          suffix="%"
                          inputMode="numeric"
                          value={String(share)}
                          onChange={(e) => {
                            const next = [...shares];
                            next[i] = Number(e.target.value.replace(/\D/g, '')) || 0;
                            setShares(next);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </FieldGroup>
            </div>
            {!sharesOk && <p className="fhint neg">{t('sharesInvalid')}</p>}
          </div>

          <ErrorNote error={create.error} fallback={t('createFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={create.isPending ? t('creating') : t('create')}
          confirmDisabled={!valid || notEnough || create.isPending}
          onConfirm={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
