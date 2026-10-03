import type { NextConfig } from "next";
import path from "node:path";

// Адрес backend'а с точки зрения ЭТОГО сервера (не браузера): в
// docker-compose это имя сервиса ("api"), при локальном запуске без
// Docker (start.bat) — тот же localhost. Браузер сюда никогда не
// обращается напрямую — только через rewrites ниже.
const BACKEND_INTERNAL_URL =
  process.env.API_INTERNAL_URL || "http://localhost:8091";

// Процесс игр (ROLE=games в docker-compose.prod.yml): раздачи и раунд
// джетпака живут в его памяти. Без переменной — тот же backend: локально
// (start.bat, dev-compose) игры идут в одном процессе вместе с остальным.
// На проде nginx хоста шлёт всё в web, поэтому разводят именно эти правила.
const GAMES_INTERNAL_URL =
  process.env.GAMES_INTERNAL_URL || BACKEND_INTERNAL_URL;

const nextConfig: NextConfig = {
  // Сборка в самодостаточный `.next/standalone` (свой server.js + только
  // реально используемые зависимости). Нужна продакшен-образу
  // (`Dockerfile.prod`): без неё в контейнер пришлось бы тащить весь
  // node_modules. На `next dev` и на локальный `next start` не влияет.
  output: "standalone",
  // Pin the Turbopack workspace root to THIS project, using the real
  // on-disk path (correct drive-letter casing + separators) so the pin
  // actually matches. Otherwise Turbopack sees two sibling lockfiles
  // (traders-api / traders-diary) and falls back to the parent folder
  // "e:/Project/traders", where "tailwindcss" can't be resolved.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Сводит браузер и backend на один origin. Без этого кука сессии,
  // поставленная backend'ом, не доезжала бы до Next-сервера — а без неё
  // middleware.ts (единственный гейт защищённых страниц) не может отличить
  // авторизованного от нет ещё до рендера.
  async rewrites() {
    return [
      // Игровые адреса — раньше общего /api: Next берёт первое совпавшее
      // правило. `:path*` совпадает и с пустым хвостом (`/api/jetpack`).
      { source: "/api/games/:path*", destination: `${GAMES_INTERNAL_URL}/api/games/:path*` },
      { source: "/api/jetpack/:path*", destination: `${GAMES_INTERNAL_URL}/api/jetpack/:path*` },
      { source: "/api/:path*", destination: `${BACKEND_INTERNAL_URL}/api/:path*` },
      { source: "/auth/:path*", destination: `${BACKEND_INTERNAL_URL}/auth/:path*` },
    ];
  },
};

export default nextConfig;
