'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setClientTerminalHint } from '@/entities/terminal';
import { API_BASE_URL } from '@/shared/config/api';
import { refreshSession, resolveApiError, setUnauthenticatedHandler } from '@/shared/api/http';
import { tokenStore } from '@/shared/lib/tokenStore';

export interface User {
  id: string;
  email: string;
  name: string | null;
  /**
   * Открыт ли этому аккаунту раздел «Пользователи».
   *
   * Приходит с бэкенда (см. backend/src/admin/owner.ts), а не выводится
   * сравнением почты здесь: второе место, где написано, кто владелец, — это
   * место, где однажды окажется другая почта. Ничего не охраняет: доступ
   * проверяется на каждом запросе, флаг только убирает из шапки ссылку,
   * которая всё равно вернула бы 403.
   *
   * Необязательное: сессии, восстановленные ответом старого бэкенда, поля не
   * несут, и это должно читаться как «нет», а не падать.
   */
  isAdmin?: boolean;
  /**
   * Адрес картинки профиля с версией; нет картинки — null. Необязательное по
   * той же причине, что `isAdmin`.
   */
  avatar?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /**
   * Новая картинка профиля — сразу в шапку, без перечитки сессии: адрес
   * вернул сам ответ загрузки.
   */
  setAvatar: (avatar: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string, ref?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return resolveApiError(data as { code?: string; message?: string | string[] });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /*
   * При загрузке страницы сессия восстанавливается из HttpOnly-куки.
   *
   * Через общий `refreshSession`, а не своим fetch'ем: тот же обмен затевают
   * запросы страницы, которая рисуется одновременно с этим, а refresh-токен у
   * бэкенда одноразовый — два параллельных обмена отняли бы куку друг у друга.
   * Там обмен один на всех, и кто пришёл вторым, дожидается первого.
   */
  useEffect(() => {
    let active = true;
    void refreshSession().then(({ user: restored }) => {
      if (!active) return;
      setUser((restored as User | null) ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // When apiFetch can no longer refresh, drop the session.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      tokenStore.set(null);
      setUser(null);
      // Тот же случай, что и в logout ниже: сессия кончилась, и в кэше не
      // должно остаться данных того, чья она была. Оставить чистку только в
      // logout значило бы закрыть одну дверь из двух — сюда попадают, когда
      // refresh-токен истёк или отозван, а вкладка осталась открытой.
      queryClient.clear();
      setClientTerminalHint(false);
    });
    return () => setUnauthenticatedHandler(null);
  }, [queryClient]);

  const applyAuthResponse = async (res: Response) => {
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    tokenStore.set(data.accessToken ?? null);
    setUser(data.user ?? null);
  };

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    await applyAuthResponse(res);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string, ref?: string) => {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, ref }),
      });
      await applyAuthResponse(res);
    },
    [],
  );

  const setAvatar = useCallback((avatar: string | null) => {
    setUser((u) => (u ? { ...u, avatar } : u));
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore network errors on logout
    }
    tokenStore.set(null);
    setUser(null);
    /*
     * Кэш react-query — данные ушедшего пользователя: сделки, теги, срезы,
     * статистика. Он переживает выход, потому что QueryClient создан выше
     * AuthProvider и живёт столько же, сколько вкладка. Без очистки следующий
     * вошедший в этой же вкладке видит на первом кадре чужой журнал — свои
     * запросы ещё в полёте, а на экране уже отрисован предыдущий ответ из
     * кэша. Заметнее всего на демо: посмотрел витрину, вышел, вошёл к себе —
     * и открыл чужую историю сделок как свою.
     *
     * Отменяем перед очисткой: запросы, оставшиеся в полёте, иначе положат
     * свои ответы обратно в уже очищенный кэш.
     */
    await queryClient.cancelQueries();
    queryClient.clear();
    // Подсказка «терминал доступен» — про ключ ушедшего пользователя: следующий
    // вошедший в этом браузере иначе увидел бы чужой пункт в шапке до первого ответа.
    setClientTerminalHint(false);
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, loading, setAvatar, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
