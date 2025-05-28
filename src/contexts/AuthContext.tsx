
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
  GoogleAuthProvider, // Added
  signInWithPopup,    // Added
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
  loginWithGoogle: () => Promise<void>; // Added
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
          // You might want to add photoURL if you use it: firebaseUser.photoURL
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
      // Router push might be better handled in the component or based on onAuthStateChanged logic elsewhere
      // router.push('/dashboard'); // Removed for now, AppLayout handles redirect
    } catch (error: any) {
      // setIsLoading(false); // Let onAuthStateChanged handle final isLoading state
      console.error("Firebase login error:", error);
      throw error; // Re-throw to be caught by the form
    }
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
      // router.push('/dashboard'); // Removed for now, AppLayout handles redirect
    } catch (error: any) {
      // setIsLoading(false);
      console.error("Firebase registration error:", error);
      throw error; // Re-throw
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle user state and isAuthenticated
      // router.push('/dashboard'); // Removed for now, AppLayout handles redirect
    } catch (error: any) {
      // setIsLoading(false);
      console.error("Firebase Google login error:", error);
      throw error; // Re-throw to be caught by the form
    }
  };

  const logout = async () => {
    // setIsLoading(true); // Not strictly necessary to set true here if onAuthStateChanged handles it
    try {
      await signOut(auth);
      // onAuthStateChanged will handle clearing user and isAuthenticated
      router.push('/login'); // Explicitly redirect on logout
    } catch (error: any) {
      console.error("Firebase logout error:", error);
      // Still proceed to clear local state if signOut fails for some reason
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoading(false); // Ensure loading is false after logout attempt
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
    loginWithGoogle, // Added
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
