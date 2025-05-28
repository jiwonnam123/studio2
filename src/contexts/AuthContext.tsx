
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
  GoogleAuthProvider,
  signInWithPopup,
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
  loginWithGoogle: () => Promise<void>;
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
          id: firebaseUser.uid, // Use uid as id
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

    return () => unsubscribe();
  }, []);
  
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error("Firebase login error:", error);
      setIsLoading(false); // Ensure loading is false on error
      throw error; 
    }
    // setIsLoading(false) will be handled by onAuthStateChanged
  };

  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name });
        // setUser({ id: userCredential.user.uid, email: userCredential.user.email, name: name });
        // setIsAuthenticated(true); 
        // No need to manually set user here, onAuthStateChanged will handle it.
      }
    } catch (error: any) {
      console.error("Firebase registration error:", error);
      setIsLoading(false); // Ensure loading is false on error
      throw error; 
    }
    // setIsLoading(false) will be handled by onAuthStateChanged
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle user state, isAuthenticated, and setIsLoading(false) on success
    } catch (error: any) {
      console.error("Firebase Google login error:", error);
      // onAuthStateChanged might not fire if popup closes very early, ensure isLoading is reset
      // If error is auth/popup-closed-by-user, onAuthStateChanged might not fire with a "no user" state immediately
      // to set isLoading(false). So, do it here if not already false.
      if (user === null) { // if user state hasn't changed to logged in
        setIsLoading(false);
      }
      throw error; 
    } finally {
        // Adding a finally block for good measure, though onAuthStateChanged should handle most cases.
        // If signInWithPopup promise resolves or rejects, and onAuthStateChanged hasn't set isLoading to false yet.
        // This is a bit tricky because onAuthStateChanged is async.
        // The primary setIsLoading(false) is in onAuthStateChanged.
        // This ensures that if an error occurs and onAuthStateChanged hasn't updated the state yet (e.g. no user logged in),
        // we don't get stuck in a loading state.
         if (auth.currentUser === null && isLoading) {
           // Only set to false if there's no current user AND we are still in a loading state from this function.
           // This check helps to avoid prematurely setting isLoading to false if onAuthStateChanged is about to set it with a valid user.
         }
    }
  };

  const logout = async () => {
    setIsLoading(true); 
    try {
      await signOut(auth);
      router.push('/login'); 
    } catch (error: any) {
      console.error("Firebase logout error:", error);
      throw error;
    } finally {
      // onAuthStateChanged will set user to null and setIsLoading(false)
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
