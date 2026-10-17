import { Skeleton } from '@/shared/ui/Skeleton';

/** Сторона картинки профиля — та же мерка, что у `.pf-ava`. */
const AVA = 'clamp(72px, 13vh, 120px)';

/**
 * Каркас карточки, пока едет ответ профиля: те же блоки на тех же местах —
 * квадрат картинки, имя и ряд значков, полоса уровня, четыре клетки, ряд
 * вкладок и строки таблицы. Колонка не стоит пустой, и ответ не сдвигает
 * страницу: блоки встают туда, где уже стояли заглушки.
 */
export function ProfileSkeleton() {
  return (
    <>
      <div className="pf-id" aria-hidden>
        <Skeleton width={AVA} height={AVA} flush />
        <div className="pf-id-t pf-skel-id">
          <Skeleton width={220} height={11} flush />
          <Skeleton width="45%" height="clamp(36px, 7vh, 72px)" flush />
          <Skeleton width={360} height={20} flush />
        </div>
      </div>
      <div className="pf-lvl" aria-hidden>
        <Skeleton width={48} height="clamp(32px, 5.6vh, 56px)" flush />
        <Skeleton height={6} flush />
      </div>
      <div className="pf-stats" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pf-stat">
            <Skeleton width={90} height={11} flush />
            <Skeleton width={110} height={26} flush />
            <Skeleton width="70%" height={11} flush />
            <Skeleton height={24} flush />
          </div>
        ))}
      </div>
      <Skeleton width={460} height={34} flush />
      <div className="pf-pane pf-skel-rows" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={28} flush />
        ))}
      </div>
    </>
  );
}
