
"use client";

import type { UserProfile } from '@/types';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import useLocalStorage from '@/hooks/useLocalStorage';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string) => Promise<void>; 
  logout: () => void;
  register: (email: string, name: string) => Promise<void>; // Added name parameter
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
  
  const login = async (email: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    // In a real app, you'd fetch user data by email.
    // For this mock, if a user previously registered and their data is in authData,
    // we could try to use it, but the simplest mock is to create a new session user.
    // This mock does not retain the name on simple login if the user registered with a name previously
    // and then logged out. A real backend would handle this.
    const mockUser: UserProfile = { id: 'mock-user-id-' + Date.now(), email }; 
    setAuthData({ isAuthenticated: true, user: mockUser });
    setIsLoading(false);
    router.push('/dashboard');
  };

  const register = async (email: string, name: string) => { // Added name parameter
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockUser: UserProfile = { id: 'mock-user-id-' + Date.now(), email, name }; // Store name
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
