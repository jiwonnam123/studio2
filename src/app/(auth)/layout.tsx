"use client";

import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
// import Image from 'next/image'; // Image is not used here anymore
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; // Added usePathname
import { motion, AnimatePresence } from 'framer-motion'; // Added framer-motion

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname

  // For debugging the re-animation issue
  // console.log(`[AuthLayout] Path: ${pathname}, isLoading: ${isLoading}, isAuthenticated: ${isAuthenticated}`);

  // Memoize the style object for the wrapper div to prevent unnecessary re-renders
  // Alternatively, use a Tailwind class like min-h-[500px] if configured.
  const wrapperStyle = useMemo(() => ({ minHeight: '500px' }), []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-violet-50 to-blue-100">
        <motion.div // Optional: Animate the loader itself
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </motion.div>
      </div>
    );
  }

  if (isAuthenticated) { // This case might not need complex animation as it's a redirect state
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-violet-50 to-blue-100">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">리디렉션 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-blue-100 p-4">
      {/* Wrapper to provide size and relative positioning context for animations */}
      <div className="relative w-full max-w-md" style={wrapperStyle}>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 30, scale: 0.97, position: 'absolute', top: 0, left: 0, width: '100%' }}
            animate={{ opacity: 1, y: 0, scale: 1, position: 'absolute', top: 0, left: 0, width: '100%' }}
            exit={{ opacity: 0, y: -30, scale: 0.97, position: 'absolute', top: 0, left: 0, width: '100%' }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
            className="flex items-center justify-center" // Centers the child Card (max-w-sm) within this motion.div
          >
            {children} {/* This will be LoginForm or RegisterForm (Card component) */}
          </motion.div>
        </AnimatePresence>
      </div>
      <footer className="absolute bottom-8 text-center text-sm text-slate-600">
        © {new Date().getFullYear()} Adpopcorn. 모든 권리 보유.
      </footer>
    </div>
  );
}
