"use client";

import type { UserProfile } from '@/types';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import useLocalStorage from '@/hooks/useLocalStorage';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string) => Promise<void>; // Simplified login
  logout: () => void;
  register: (email: string) => Promise<void>; // Simplified register
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'formflow_auth_status';

interface AuthStorageState {
  isAuthenticated: boolean;
  user: UserProfile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [authData, setAuthData] = useLocalStorage<AuthStorageState>(AUTH_STORAGE_KEY, {
    isAuthenticated: false,
    user: null,
  });
  const router = useRouter();

  useEffect(() => {
    setIsLoading(false);
  }, []);
  
  // Simulate API calls for login/register
  const login = async (email: string) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockUser: UserProfile = { id: 'mock-user-id', email };
    setAuthData({ isAuthenticated: true, user: mockUser });
    setIsLoading(false);
    router.push('/dashboard');
  };

  const register = async (email: string) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockUser: UserProfile = { id: 'mock-user-id-' + Date.now(), email };
    setAuthData({ isAuthenticated: true, user: mockUser });
    setIsLoading(false);
    router.push('/dashboard');
  };

  const logout = () => {
    setAuthData({ isAuthenticated: false, user: null });
    router.push('/login');
  };

  const value = {
    user: authData.user,
    isAuthenticated: authData.isAuthenticated,
    isLoading,
    login,
    logout,
    register,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
