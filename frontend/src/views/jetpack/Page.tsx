'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useJetpack, useJetpackSocket, type JetpackView } from '@/entities/jetpack';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { BetPanel } from './components/BetPanel';
import { FlightStage } from './components/FlightStage';
import { History } from './components/History';
import { RoundBets } from './components/RoundBets';

/**
 * Джетпак — /games/jetpack. Раунд один на всех: окно ставок, взлёт, краш.
 * Первый снимок — REST (он же будит цикл на сервере), дальше вид приносит
 * сокет; ставка и вывод — REST. Кадр полёта считается от серверного времени
 * и пишется в DOM (`FlightStage`, `BetPanel`), а не через состояние: иначе
 * каждый кадр перерисовывал бы весь экран.
 *
 * Экран — ровно окно под шапкой, как стол карточных игр: сцена забирает всё,
 * что осталось от панели ставки.
 */
export function JetpackPage() {
  const t = useTranslations('jetpack');
  const { data: view, error, isLoading } = useJetpack();
  useJetpackSocket();

  return (
    <>
      <div className="games-bg" aria-hidden />
      <div className="jpg-page">
        {view ? (
          <Game view={view} />
        ) : isLoading ? (
          <p className="jpg-wait">{t('loading')}</p>
        ) : (
          <ErrorNote error={error} fallback={t('loadFailed')} />
        )}
      </div>
    </>
  );
}

function Game({ view }: { view: JetpackView }) {
  const t = useTranslations('jetpack');
  return (
    <>
      <header className="jpg-top">
        <Link href="/games" className="jpg-back">
          ← {t('back')}
        </Link>
        <History items={view.history} />
      </header>
      <div className="jpg-body">
        <div className="jpg-main">
          <FlightStage view={view} />
          <BetPanel view={view} />
        </div>
        <RoundBets view={view} />
      </div>
    </>
  );
}
