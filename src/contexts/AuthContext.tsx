
"use client";

import type { UserProfile } from '@/types';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// import { useRouter } from 'next/navigation'; // No longer needed here for direct redirection
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
  const [isLoading, setIsLoading] = useState(true); // Start with loading true for initial auth check
  // const router = useRouter(); // Removed, redirection handled by layouts/pages listening to context

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
      setIsLoading(false); // Auth state determined, set loading to false
    });

    return () => unsubscribe();
  }, []);
  
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will set isAuthenticated and setIsLoading(false)
    } catch (error: any) {
      console.error("Firebase login error:", error);
      setIsLoading(false); // Reset loading on direct error
      throw error; 
    }
  };

  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name });
        // Refresh user data if needed, or let onAuthStateChanged handle updated profile.
        // Forcing a reload of the user or re-triggering onAuthStateChanged might be complex.
        // Simpler: onAuthStateChanged will pick up the new user, displayName might update on next auth state change or refresh.
        // To immediately reflect name change if onAuthStateChanged doesn't pick it up fast enough for current session:
        if (auth.currentUser) { // Check if currentUser is available
           const updatedUser = auth.currentUser;
            const userProfile: UserProfile = {
                id: updatedUser.uid,
                email: updatedUser.email,
                name: updatedUser.displayName,
            };
            setUser(userProfile); // Manually update context user with new name
        }
      }
      // onAuthStateChanged will set isAuthenticated and setIsLoading(false)
    } catch (error: any) {
      console.error("Firebase registration error:", error);
      setIsLoading(false); // Reset loading on direct error
      throw error; 
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true); 
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will set isAuthenticated and setIsLoading(false)
    } catch (error: any) {
      console.error("Firebase Google login error:", error);
      setIsLoading(false); // Reset loading on direct error (e.g., popup closed)
      throw error;
    }
  };

  const logout = async () => {
    setIsLoading(true); 
    try {
      await signOut(auth);
      // onAuthStateChanged will set user to null, isAuthenticated to false, and setIsLoading to false.
    } catch (error: any) {
      console.error("Firebase logout error:", error);
      setIsLoading(false); // Reset loading on direct error
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
