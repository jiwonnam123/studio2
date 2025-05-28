
"use client";

import type { UserProfile } from '@/types';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation'; // Keep useRouter if used elsewhere, though not directly in this snippet for redirects
import { 
  getAuth, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  type User as FirebaseUser 
} from "firebase/auth";
import { app } from '@/lib/firebase'; 

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>; 
  logout: () => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const auth = getAuth(app);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter(); // router might still be needed for explicit logout navigation

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
      setIsLoading(false); // Central point for setting isLoading to false after auth state is known
    });

    return () => unsubscribe();
  }, []);
  
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle isLoading, user, and isAuthenticated
    } catch (error: any) {
      console.error("Firebase login error:", error);
      setIsLoading(false); // Set loading to false on direct error from signIn
      throw error; 
    }
  };

  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name });
      }
      // onAuthStateChanged will handle isLoading, user, and isAuthenticated
    } catch (error: any) {
      console.error("Firebase registration error:", error);
      setIsLoading(false); // Set loading to false on direct error from createUser
      throw error; 
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true); // Set loading true at the beginning of the attempt
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // If successful, onAuthStateChanged will:
      // 1. Set the user and isAuthenticated.
      // 2. Set isLoading to false.
      // This will then trigger the redirect in AppLayout or HomePage.
    } catch (error: any) {
      console.error("Firebase Google login error:", error);
      // If signInWithPopup fails (e.g., popup closed, network error before auth completes),
      // onAuthStateChanged should still fire (potentially with no user or the old user state).
      // onAuthStateChanged will be responsible for setting isLoading to false.
      // We re-throw the error so the LoginForm can display a toast to the user.
      // No explicit setIsLoading(false) here; let onAuthStateChanged handle it to prevent race conditions.
      throw error;
    }
  };

  const logout = async () => {
    setIsLoading(true); 
    try {
      await signOut(auth);
      // onAuthStateChanged will set user to null, isAuthenticated to false, and isLoading to false.
      // AppLayout or HomePage will then redirect to /login.
      // Explicit router.push('/login') can be added here if immediate navigation is preferred over relying on useEffect in layouts.
      // For consistency with current pattern, let's rely on useEffect for now.
      // router.push('/login'); // If uncommented, ensure it doesn't conflict with layout effects
    } catch (error: any) {
      console.error("Firebase logout error:", error);
      setIsLoading(false); // Set loading to false on direct error from signOut
      throw error;
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
    loginWithGoogle,
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
