'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import { useCreateTournament, type TournamentVisibility } from '@/entities/tournament';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, FieldGroup, Input, Select } from '@/shared/ui/Field';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { defaultStartInput, earliestStartInput, startInputOk } from '../lib/start-input';
import { defaultShares, sharesValid } from '../model/payout-shares';

const DURATIONS = [60, 240, 1440, 4320, 10080] as const;
/** Границы — те же, что у сервера (`tournament.config.ts`). */
const ARENA_MIN = 3;
const ARENA_MAX = 30;
const MAX_WINNERS = 10;
const TEAM_MIN = 2;
const TEAM_MAX = 15;

/**
 * Формат в форме. Дуэль — это арена на двоих с одним победителем (сервер её
 * отдельно не хранит), но выбирают её отдельной кнопкой: «один на один» —
 * самое частое, что создают, и собирать его из числа мест незачем.
 */
type Kind = 'duel' | 'arena' | 'teams';

/** Как турнир выходит из лобби: когда готовы все — или сам в назначенное время. */
type StartMode = 'ready' | 'time';

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
 * Три формата (решение владельца 2026-09-27): дуэль — один на один, арена —
 * 3–30 игроков с победителями и долями по местам, команды — две по 2–15, фонд
 * победившей команде поровну. Поля мест и призов зависят от формата: у дуэли
 * их нет вовсе, у команд вместо числа мест — размер команды, а призы
 * описаны одной строкой.
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
  const [kind, setKind] = useState<Kind>('duel');
  const [arenaPlayers, setArenaPlayers] = useState(5);
  const [teamSize, setTeamSize] = useState(5);
  const [deposit, setDeposit] = useState('10000');
  const [durationMin, setDurationMin] = useState<number>(240);
  const [entryFee, setEntryFee] = useState('100');
  const [prizeBonus, setPrizeBonus] = useState('0');
  const [winnersCount, setWinnersCount] = useState(1);
  const [shares, setShares] = useState<number[]>(() => defaultShares(1));
  const [startMode, setStartMode] = useState<StartMode>('ready');
  // Момент, от которого считаются границы времени старта. Снимается при
  // выборе режима и при каждой правке поля, а не в рендере: форма стоит
  // открытой минутами, и проверять «не раньше чем через две минуты» от
  // времени, снятого вне событий, значило бы перерисовывать её по таймеру.
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [startLocal, setStartLocal] = useState(() => defaultStartInput(Date.now()));

  const visibilityOptions: SegOption<TournamentVisibility>[] = [
    { value: 'private', label: t('visibilityPrivate') },
    { value: 'public', label: t('visibilityPublic') },
  ];
  const durationOptions: SegOption<number>[] = DURATIONS.map((m) => ({ value: m, label: t(`duration.${m}`) }));
  const kindOptions: SegOption<Kind>[] = [
    { value: 'duel', label: t('kindDuel') },
    { value: 'arena', label: t('kindArena') },
    { value: 'teams', label: t('kindTeams') },
  ];
  const startModeOptions: SegOption<StartMode>[] = [
    { value: 'ready', label: t('startByReady') },
    { value: 'time', label: t('startByTime') },
  ];

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
  const arena = kind === 'arena';
  const maxPlayers = kind === 'duel' ? 2 : kind === 'teams' ? teamSize * 2 : arenaPlayers;
  // Победители и доли задаёт создатель только у арены: у дуэли победитель
  // один, у команд фонд делит сервер поровну между победившей стороной.
  const winnersSent = arena ? winnersCount : 1;
  const sharesSent = arena ? shares : [100];
  const sharesOk = !arena || sharesValid(shares, winnersCount);
  const startOk = startMode === 'ready' || startInputOk(startLocal, checkedAt);
  const valid = nameOk && numbersOk && sharesOk && startOk && (!arena || winnersCount < maxPlayers);

  // Что создатель платит прямо сейчас: свой взнос и добавку в фонд.
  const dueNow = (numbersOk ? feeN : 0) + (numbersOk ? bonusN : 0);
  const notEnough = coins != null && dueNow > coins.balance;
  // Фонд при полном наборе мест — сколько турнир обещает, а не сколько собрал.
  const poolFull = numbersOk ? feeN * maxPlayers + bonusN : 0;

  // Мест стало меньше числа победителей — подвинуть победителей, иначе форма
  // молча оставалась бы невалидной без видимой причины.
  const applyArenaPlayers = (n: number) => {
    setArenaPlayers(n);
    if (winnersCount >= n) applyWinners(Math.min(n - 1, MAX_WINNERS));
  };
  const applyWinners = (n: number) => {
    setWinnersCount(n);
    setShares(defaultShares(n));
  };
  // Время подставляется заново при каждом переходе на «По времени»: прежнее
  // значение могло уже уйти в прошлое, пока форма стояла открытой.
  const applyStartMode = (mode: StartMode) => {
    const now = Date.now();
    setStartMode(mode);
    setCheckedAt(now);
    if (mode === 'time') setStartLocal(defaultStartInput(now));
  };

  const submit = () => {
    // Границы проверяются ещё раз по часам нажатия: окно создания не
    // размонтируется между открытиями, и время, выбранное час назад, могло
    // уже уйти в прошлое, а `checkedAt` о нём не знает. Иначе форма звала бы
    // «Создать» и получала отказ сервера.
    const now = Date.now();
    if (startMode === 'time' && !startInputOk(startLocal, now)) {
      setCheckedAt(now);
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        visibility,
        format: kind === 'teams' ? 'teams' : 'arena',
        ...(kind === 'teams' ? { teamSize } : {}),
        maxPlayers,
        startBalance: depositN,
        durationMin,
        entryFee: feeN,
        prizeBonus: bonusN,
        winnersCount: winnersSent,
        payoutShares: sharesSent,
        // Поле хранит местное время браузера; серверу — момент в ISO.
        ...(startMode === 'time' ? { startsAt: new Date(startLocal).toISOString() } : {}),
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
  };

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
                {poolFull} <CoinIcon />
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
            <FieldGroup label={t('formatLabel')}>
              <Seg options={kindOptions} value={kind} onChange={setKind} ariaLabel={t('formatLabel')} />
            </FieldGroup>
            <div className="fgrid">
              {kind === 'arena' && (
                <Field label={t('playersLabel')}>
                  {(id) => (
                    <Select
                      id={id}
                      full
                      value={arenaPlayers}
                      onChange={(e) => applyArenaPlayers(Number(e.target.value))}
                    >
                      {Array.from({ length: ARENA_MAX - ARENA_MIN + 1 }, (_, i) => i + ARENA_MIN).map((n) => (
                        <option key={n} value={n}>
                          {t('seatsN', { n })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              {kind === 'teams' && (
                <Field label={t('teamSizeLabel')}>
                  {(id) => (
                    <Select id={id} full value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))}>
                      {Array.from({ length: TEAM_MAX - TEAM_MIN + 1 }, (_, i) => i + TEAM_MIN).map((n) => (
                        <option key={n} value={n}>
                          {t('teamSizeN', { n })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

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

            <FieldGroup label={t('startModeLabel')}>
              <Seg
                options={startModeOptions}
                value={startMode}
                onChange={applyStartMode}
                ariaLabel={t('startModeLabel')}
              />
            </FieldGroup>
            {startMode === 'time' && (
              <Field label={t('startLabel')}>
                {(id) => (
                  <Input
                    id={id}
                    full
                    type="datetime-local"
                    value={startLocal}
                    min={earliestStartInput(checkedAt)}
                    onChange={(e) => {
                      setStartLocal(e.target.value);
                      setCheckedAt(Date.now());
                    }}
                  />
                )}
              </Field>
            )}
            <p className={startOk ? 'fhint' : 'fhint neg'}>
              {startMode === 'ready' ? t('startHintReady') : startOk ? t('startHintTime') : t('startTooSoon')}
            </p>
          </div>

          <div className="fsect">
            <span className="lbl fsect-head">{t('groupStakes')}</span>
            <div className="fgrid">
              <Field label={t('entryFeeLabel')}>
                {(id) => (
                  <Input
                    id={id}
                    full
                    suffix={<CoinIcon />}
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
                    suffix={<CoinIcon />}
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
            {/* У дуэли и команд призы — одна строка: делить по местам там
                нечего, и поля долей только спрашивали бы о том, что решено. */}
            {!arena && <p className="fhint">{kind === 'duel' ? t('prizeDuelHint') : t('prizeTeamsHint')}</p>}
            {arena && (
              <div className="fgrid">
                <Field label={t('winnersLabel')}>
                  {(id) => (
                    <Select id={id} full value={winnersCount} onChange={(e) => applyWinners(Number(e.target.value))}>
                      {Array.from({ length: Math.min(maxPlayers - 1, MAX_WINNERS) }, (_, i) => i + 1).map((n) => (
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
            )}
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
