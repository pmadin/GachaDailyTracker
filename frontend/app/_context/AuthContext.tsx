'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchProfile, type AuthUser } from '../_lib/api';
import { getToken, setToken, clearToken, getStoredUser, setStoredUser } from '../_lib/storage';

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = getToken();
    const storedUser = getStoredUser();
    setTokenState(storedToken);
    setUser(storedUser);
    setIsLoading(false);

    // Verification gates (admin, scheduler, submissions, badges) read email_verified off the
    // stored user, which can be stale: missing on pre-V5 sessions, or false after verifying on
    // another device. Re-check once per load unless it's already known to be true.
    if (storedToken && storedUser && storedUser.email_verified !== true) {
      fetchProfile(storedToken)
        .then(({ user: fresh }) => {
          if (typeof fresh.email_verified !== 'boolean') return;
          const patch = {
            email_verified: fresh.email_verified,
            email_verify_deadline: fresh.email_verify_deadline ?? null,
          };
          setStoredUser({ ...storedUser, ...patch });
          setUser(current => (current && current.id === storedUser.id ? { ...current, ...patch } : current));
        })
        .catch(() => {});
    }
  }, []);

  const login = useCallback((t: string, u: AuthUser) => {
    setToken(t);
    setStoredUser(u);
    setTokenState(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
