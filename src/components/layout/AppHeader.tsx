import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6">
      {/* Left section (now contains logo) */}
      <div className="flex-1">
        {/* <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Image src="/adpopcorn-logo.svg" alt="Adpopcorn Logo" width={24} height={24} /> 
          <span>Dashboard</span>
        </Link> */}
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
