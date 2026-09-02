// Базовый URL для запросов к API из браузера. Пусто по умолчанию: браузер
// ходит на свой же origin, а Next-сервер проксирует /api/* и /auth/* на
// backend через rewrites (см. next.config.ts). Это не просто удобство —
// разные origin означали бы, что кука сессии, поставленная backend'ом, не
// доезжает до Next-сервера, и middleware (единственный гейт защищённых
// страниц, см. frontend/middleware.ts) не смог бы её увидеть.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
