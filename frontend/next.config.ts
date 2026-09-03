import type { NextConfig } from "next";
import path from "node:path";

// Адрес backend'а с точки зрения ЭТОГО сервера (не браузера): в
// docker-compose это имя сервиса ("api"), при локальном запуске без
// Docker (start.bat) — тот же localhost. Браузер сюда никогда не
// обращается напрямую — только через rewrites ниже.
//
// Читается на сборке, а не на старте: Next записывает готовые destination в
// .next/routes-manifest.json, и переменная, выставленная только у запущенного
// контейнера, уже ни на что не влияет. Поэтому в Dockerfile.prod это ARG.
const BACKEND_INTERNAL_URL =
  process.env.API_INTERNAL_URL || "http://localhost:8091";

const nextConfig: NextConfig = {
  // Самодостаточный сервер в .next/standalone: только он и прослеженные им
  // зависимости, без node_modules и без чтения этого файла на старте. Для
  // прод-образа (frontend/Dockerfile.prod) это ещё и обязательное условие —
  // иначе `next start` пришлось бы тащить typescript, чтобы прочитать
  // next.config.ts. На `next dev` не влияет.
  output: 'standalone',
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
      { source: "/api/:path*", destination: `${BACKEND_INTERNAL_URL}/api/:path*` },
      { source: "/auth/:path*", destination: `${BACKEND_INTERNAL_URL}/auth/:path*` },
    ];
  },
};

export default nextConfig;
