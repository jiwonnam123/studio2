
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
      // If loading is complete AND user is authenticated,
      // they shouldn't be on an auth page (login/register). Redirect to dashboard.
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    // Show a loading indicator while auth state is being determined initially
    // or during an auth operation triggered from this page.
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    // If authenticated and useEffect for redirect hasn't kicked in yet,
    // show a loading/redirecting message to prevent brief flash of login/register form.
    return (
         <div className="flex h-screen w-screen items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-foreground">Redirecting...</p>
        </div>
    );
  }

  // If not loading and not authenticated, show the login/register form
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
       <div className="absolute top-8 left-8">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Image src="https://placehold.co/150x24.png" alt="Adpopcorn Logo" width={150} height={24} data-ai-hint="Adpopcorn logo" />
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

