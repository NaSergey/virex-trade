'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
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
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return resolveApiError(data as { code?: string; message?: string | string[] });
}

export function AuthProvider({ children }: { children: ReactNode }) {
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
    });
    return () => setUnauthenticatedHandler(null);
  }, []);

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
    async (email: string, password: string, name?: string) => {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      await applyAuthResponse(res);
    },
    [],
  );

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
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
