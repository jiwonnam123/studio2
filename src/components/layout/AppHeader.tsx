"use client";

import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

const ADMIN_EMAIL = 'jirrral@gmail.com';

export function AppHeader() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6">
      {/* Left section (now contains logo) */}
      <div className="flex-1 flex items-center gap-4">
        {isAdmin && (
          <Link href="/admin/campaign-email" className="text-sm font-semibold hover:underline">
            이메일 매핑 관리
          </Link>
        )}
      </div>

      {/* Left section for Logo */}
      <div className="flex items-center">
        <Link href="/dashboard">
          <Image 
            src="/adpopcorn-logo.png"
            alt="Adpopcorn Logo" 
            width={180}
            height={54}
            priority // Load logo quickly
          />
        </Link>
      </div>

      {/* Right section for UserNav */}
      <div className="flex flex-1 justify-end items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
