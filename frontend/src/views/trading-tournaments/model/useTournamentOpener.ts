'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTournamentPreload } from '@/entities/tournament';

/** Адрес витрины: и сама страница игры, и то, чем кончается ссылка-приглашение. */
const PAGE = '/games/trading';
/** Турнир в адресе: `?t=<id>` — окно открывается само. См. InviteLink. */
const PARAM = 't';

/**
 * Открытие турнира окном: сначала данные, потом окно.
 *
 * Порядок именно такой, потому что окно центрируется по собственному размеру.
 * Пока оно открывалось сразу, внутри стояла заглушка на 200 пикселей, а через
 * полсекунды на её место приезжала вся сводка — окно разворачивалось и уезжало
 * вверх на глазах, и в этот же кадр в шапке окна из ниоткуда появлялся статус.
 * Заглушка поудобнее эту вторую перерисовку не убирает, убирает только
 * порядок: данные — в кэш, и уже с ними монтировать окно.
 *
 * Цена решения — пауза между нажатием и открытием. Её съедает `warm`: данные
 * заказываются по наведению и по фокусу с клавиатуры, то есть до клика, и к
 * нажатию обычно уже лежат в кэше. На тачскрине наведения нет, поэтому пауза
 * остаётся — и на это время строка помечается занятой (`openingId`), иначе тап
 * выглядит промахом и человек жмёт второй раз.
 *
 * Тот же путь открывает турнир и пришедшему по ссылке (`?t=<id>`): отдельной
 * страницы у турнира нет, и человек снаружи должен увидеть ровно то же, что
 * человек из списка. Закрыв окно, он остаётся на витрине — адрес чистится,
 * иначе турнир открывался бы заново при каждой перезагрузке.
 */
export function useTournamentOpener() {
  const { warm, ready } = useTournamentPreload();
  const router = useRouter();
  const invited = useSearchParams().get(PARAM);
  const [open, setOpen] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // Какой турнир ждём сейчас. Клик по второй строке, пока едет первая, должен
  // открыть вторую — а не ту, чей запрос вернулся первым.
  const awaited = useRef<string | null>(null);

  const openTournament = useCallback(
    async (id: string) => {
      awaited.current = id;
      setOpeningId(id);
      await ready(id);
      if (awaited.current !== id) return;
      setOpeningId(null);
      setOpen(id);
    },
    [ready],
  );

  const closeTournament = useCallback(() => {
    awaited.current = null;
    setOpeningId(null);
    setOpen(null);
    if (invited) router.replace(PAGE, { scroll: false });
  }, [invited, router]);

  useEffect(() => {
    if (!invited) return;
    let alive = true;
    awaited.current = invited;
    // Не через openTournament: тот ставит «строка занята», а у пришедшего по
    // ссылке никакой строки нет — он ждёт на пустой витрине, и помечать ему
    // нечего. Открывается окно из колбэка, когда данные уже в кэше.
    void ready(invited).then(() => {
      if (alive && awaited.current === invited) setOpen(invited);
    });
    return () => {
      alive = false;
    };
  }, [invited, ready]);

  return { open, openingId, openTournament, warmTournament: warm, closeTournament };
}
