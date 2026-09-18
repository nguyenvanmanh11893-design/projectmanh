import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setOnUnauthorized } from '../../lib/api';
import type { User } from '../../lib/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: { username?: string; email?: string; password: string }) => Promise<void>;
  register: (payload: {
    username: string;
    email: string;
    password: string;
    full_name?: string;
    invitation_token?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.auth.me();
      // Ensure CSRF token is freshly obtained for this active session
      try {
        await api.auth.csrf();
      } catch {
        // Ignore if csrf retrieval fails
      }
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
    });

    const initAuth = async () => {
      setLoading(true);
      await refreshUser();
      setLoading(false);
    };

    initAuth();
  }, [refreshUser]);

  const login = async (credentials: { username?: string; email?: string; password: string }) => {
    const data = await api.auth.login(credentials);
    setUser(data.user);
  };

  const register = async (payload: {
    username: string;
    email: string;
    password: string;
    full_name?: string;
    invitation_token?: string;
  }) => {
    await api.auth.register(payload);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
