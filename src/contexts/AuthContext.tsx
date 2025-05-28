
"use client";

import type { UserProfile } from '@/types';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { 
  getAuth, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  updateProfile,
  type User as FirebaseUser 
} from "firebase/auth";
import { app } from '@/lib/firebase'; // Import your Firebase app instance

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>; 
  logout: () => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const auth = getAuth(app);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userProfile: UserProfile = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
        };
        setUser(userProfile);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []);
  
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle setting user and isAuthenticated
      router.push('/dashboard');
    } catch (error: any) {
      setIsLoading(false);
      console.error("Firebase login error:", error);
      throw error; // Re-throw to be caught by the form
    }
    // setIsLoading(false) will be handled by onAuthStateChanged's effect
  };

  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name });
        // Update local user state immediately for better UX, though onAuthStateChanged will also fire
        setUser({ id: userCredential.user.uid, email: userCredential.user.email, name: name });
        setIsAuthenticated(true);
      }
      // onAuthStateChanged will also update the state
      router.push('/dashboard');
    } catch (error: any) {
      setIsLoading(false);
      console.error("Firebase registration error:", error);
      throw error; // Re-throw
    }
     // setIsLoading(false) will be handled by onAuthStateChanged's effect
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will handle clearing user and isAuthenticated
      router.push('/login');
    } catch (error: any) {
      console.error("Firebase logout error:", error);
      // Still proceed to clear local state if signOut fails for some reason
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      // Ensure loading state is reset even if router push is part of onAuthStateChanged
      // However, the main isLoading is for the initial auth check.
      // For logout, we don't necessarily need a global isLoading here,
      // as onAuthStateChanged will set it false once the user is null.
    }
  };

  const value = {
    user,
    isAuthenticated,
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
