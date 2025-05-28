
"use client";

import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If authenticated, we want to show a loading state while redirecting,
  // instead of briefly flashing the login/register page.
  if (isAuthenticated) {
    return (
         <div className="flex h-screen w-screen items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-foreground">Redirecting...</p>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
       <div className="absolute top-8 left-8">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Image
            src="/adpopcorn-logo.svg"
            alt="Adpopcorn Logo"
            width={200}
            height={30}
            priority 
          />
        </Link>
      </div>
      <div className="w-full max-w-md">
        {children} {/* This will be LoginForm or RegisterForm */}
      </div>
       <footer className="absolute bottom-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Adpopcorn. All rights reserved.
      </footer>
    </div>
  );
}

