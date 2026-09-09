'use client';

import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';

/**
 * Шапка лендинга — тот же приём, что уже есть на `/login`: языковой
 * переключатель, зафиксированный в углу экрана, виден с первого кадра, не
 * ждёт скролла. Больше в шапке ничего нет — ни марки, ни переключателя темы
 * (на `/login` его тоже нет: тема вне продукта не переключается), ни ссылки
 * входа (она уже стоит в конце истории, в FinaleScene, — дублировать здесь
 * незачем).
 */
export function LandingHeader() {
  return (
    <div className="ls-locale-fixed">
      <LocaleSwitch className="seg-tight" />
    </div>
  );
}
