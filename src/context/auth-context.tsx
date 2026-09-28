"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type PortalUser = {
  id?: string;
  username: string;
  email?: string;
  role: string;
  status?: string;
};

type AuthContextValue = {
  user: PortalUser | null;
  ready: boolean;
  setUser: (user: PortalUser | null) => void;
  signOut: () => Promise<void>;
};

const STORAGE_KEY = "authshield-user";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, updateUser] = useState<PortalUser | null>(null);
  const [ready, setReady] = useState(false);

  const setUser = useCallback((nextUser: PortalUser | null) => {
    updateUser(nextUser);
    if (nextUser) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEY);
    if (savedUser) {
      try {
        updateUser(JSON.parse(savedUser) as PortalUser);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    fetch("/api/users/profile", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session expired");
        const result = await response.json();
        updateUser(result.user as PortalUser);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user));
      })
      .catch(() => {
        updateUser(null);
        localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => setReady(true));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setUser(null);
    }
  }, [setUser]);

  const value = useMemo(() => ({ user, ready, setUser, signOut }), [user, ready, setUser, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
