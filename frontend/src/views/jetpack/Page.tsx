'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useJetpack, useJetpackSocket, type JetpackView } from '@/entities/jetpack';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { AudioToggles } from './components/AudioToggles';
import { BetPanel } from './components/BetPanel';
import { FlightStage } from './components/FlightStage';
import { History } from './components/History';
import { RoundBets } from './components/RoundBets';
import { useJetpackSound } from './model/useJetpackSound';

/**
 * Джетпак — /games/jetpack. Раунд один на всех: окно ставок, взлёт, краш.
 * Первый снимок — REST (он же будит цикл на сервере), дальше вид приносит
 * сокет; ставка и вывод — REST. Кадр полёта считается от серверного времени
 * и пишется в DOM (`FlightStage`, `BetPanel`), а не через состояние: иначе
 * каждый кадр перерисовывал бы весь экран.
 *
 * Экран — ровно окно под шапкой, и сцена занимает его целиком; панели лежат
 * поверх неё на затемнённом стекле (`.jpg-hud`). На телефоне они уходят под
 * сцену.
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
      <Sound view={view} />
      <FlightStage view={view} />
      <div className="jpg-shade" aria-hidden />
      <div className="jpg-hud">
        <header className="jpg-top">
          <Link href="/games" className="jpg-back">
            ← {t('back')}
          </Link>
          <History items={view.history} />
          <AudioToggles />
        </header>
        <BetPanel view={view} />
        <RoundBets view={view} />
      </div>
    </>
  );
}

/**
 * Звук — отдельным узлом без разметки: громкость читается подпиской на
 * хранилище, и ползунок перерисовывает только его, а не сцену и панели.
 */
function Sound({ view }: { view: JetpackView }) {
  useJetpackSound(view);
  return null;
}
