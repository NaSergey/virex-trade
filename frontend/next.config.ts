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

// Хост поддомена админки — регуляркой условия `has` (Next сверяет её с именем
// хоста целиком). То же правило, что `isAdminHost` в shared/lib/utils/admin-host.ts.
const ADMIN_HOST = "admin\\..+";

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
  // Админка — поддомен того же Next (`proxy.ts`); локально это
  // `admin.localhost:<порт>`. Dev-сервер Next отклоняет запросы своих
  // служебных ресурсов (HMR, чанки) с чужого origin — без этой строки админка
  // локально открывалась бы без живой перезагрузки. На прод-сборку не влияет.
  allowedDevOrigins: ["admin.localhost"],
  // Сводит браузер и backend на один origin. Без этого кука сессии,
  // поставленная backend'ом, не доезжала бы до Next-сервера — а без неё
  // middleware.ts (единственный гейт защищённых страниц) не может отличить
  // авторизованного от нет ещё до рендера.
  async rewrites() {
    return {
      // Поддомен админки (`admin.*`): его адреса без префикса — это страницы
      // `app/admin/*` (`/` — кошельки, `/saved`, `/users`, `/login`). Здесь, а
      // не в `proxy.ts`: rewrite оттуда Next сверяет со своим origin
      // (`HOSTNAME` сервера), на standalone-сборке считает внешним и проксирует
      // новым запросом с Host сервера. Эти — внутренние. До файлов, чтобы
      // `/` поддомена не стал лендингом; `/api`, `/auth` и статика — мимо, их
      // ведут правила ниже и сам Next. Хост — то же правило, что `isAdminHost`.
      //
      // Порядок важен: правила фазы применяются цепочкой, и корень первым стал
      // бы `/admin`, а общее правило дописало бы ему второй `/admin` (404).
      beforeFiles: [
        {
          source: "/:path((?!api/|auth/|_next/|assets/|favicon\\.ico).+)",
          has: [{ type: "host", value: ADMIN_HOST }],
          destination: "/admin/:path",
        },
        { source: "/", has: [{ type: "host", value: ADMIN_HOST }], destination: "/admin" },
      ],
      afterFiles: [
        // Игровые адреса — раньше общего /api: Next берёт первое совпавшее
        // правило. `:path*` совпадает и с пустым хвостом (`/api/jetpack`).
        { source: "/api/games/:path*", destination: `${GAMES_INTERNAL_URL}/api/games/:path*` },
        { source: "/api/jetpack/:path*", destination: `${GAMES_INTERNAL_URL}/api/jetpack/:path*` },
        { source: "/api/:path*", destination: `${BACKEND_INTERNAL_URL}/api/:path*` },
        { source: "/auth/:path*", destination: `${BACKEND_INTERNAL_URL}/auth/:path*` },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
