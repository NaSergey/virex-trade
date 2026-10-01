/**
 * Звуки стола — общие у покера и блэкджека. Звук идёт за движением: что и
 * когда звучит, выводит тот же `advance`, что и движение (`Track.cues`), а
 * здесь — только чем звучит.
 *
 * Записи — Kenney Casino Audio и Interface Sounds (CC0), `public/assets/sounds`.
 * Заменить запись значит поправить одну строку.
 */
export type TableSound =
  | 'shuffle' // колода тасуется перед сдачей
  | 'deal' // карта полетела от колоды
  | 'flip' // карта перевернулась на месте
  | 'fold' // карты места уходят в колоду
  | 'chip' // фишки легли ставкой
  | 'sweep' // ставки поехали: в банк, к крупье, в плашку
  | 'win' // выигрыш долетел до места
  | 'turn' // ход перешёл ко мне
  | 'tick'; // время моего хода кончается

/** Звук снимка: что и через сколько миллисекунд от его прихода. */
export interface Cue {
  sound: TableSound;
  delay: number;
}

/** Общий пустой список: снимок без звуков не меняет ссылку и ничего не проигрывает. */
export const NO_CUES: readonly Cue[] = [];

interface SoundDef {
  /**
   * Варианты записи выбираются случайно: двадцать карт сдачи одной записью
   * звучат пулемётом. Но только похожие между собой — иначе один предмет
   * звучит двумя.
   */
  files: string[];
  gain: number;
  /**
   * Сигнал звучит и у фоновой вкладки: он для того, кто отвлёкся. Звуки стола
   * там молчат — без картинки это шум.
   */
  signal?: boolean;
}

const file = (name: string) => `/assets/sounds/${name}.mp3`;
const variants = (name: string, n: number) => Array.from({ length: n }, (_, i) => file(`${name}-${i + 1}`));

// Громкости выровнены по средней энергии записей: сигналы из интерфейсного
// пака на 12–15 дБ громче шороха карт и прибраны сильнее.
export const SOUNDS: Record<TableSound, SoundDef> = {
  shuffle: { files: [file('shuffle')], gain: 0.9 },
  deal: { files: variants('deal', 4), gain: 0.6 },
  flip: { files: variants('flip', 4), gain: 0.8 },
  fold: { files: variants('fold', 2), gain: 0.9 },
  // Одна запись, без вариантов: в паке одна фишка щёлкает звонко, другая —
  // глухо и с отскоками, и вперемешку это звучало двумя разными предметами.
  chip: { files: [file('chip')], gain: 0.8 },
  sweep: { files: variants('sweep', 2), gain: 1 },
  win: { files: variants('win', 2), gain: 0.9 },
  turn: { files: [file('turn')], gain: 0.3, signal: true },
  tick: { files: [file('tick')], gain: 0.3, signal: true },
};

export const SOUND_FILES: readonly string[] = Object.values(SOUNDS).flatMap((d) => d.files);

/**
 * Одинаковые звуки ближе этого — один звук: расчёт шести мест в один момент,
 * вскрытие трёх рук — один жест крупье, а не шесть наложенных записей.
 */
export const THIN_MS = 40;

export function thin(cues: readonly Cue[]): Cue[] {
  const last = new Map<TableSound, number>();
  return [...cues]
    .sort((a, b) => a.delay - b.delay)
    .filter((c) => {
      const prev = last.get(c.sound);
      if (prev !== undefined && c.delay - prev < THIN_MS) return false;
      last.set(c.sound, c.delay);
      return true;
    });
}

/** Тиканье — раз в секунду в последние столько миллисекунд хода. */
export const TICK_FROM = 5000;

/** Когда тикать (мс от `now`): на 5, 4, 3, 2 и 1 секунде до дедлайна, уже прошедшие — нет. */
export function tickDelays(deadline: number, now: number): number[] {
  const out: number[] = [];
  for (let left = TICK_FROM; left >= 1000; left -= 1000) {
    const d = deadline - left - now;
    if (d >= 0) out.push(d);
  }
  return out;
}
