import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6">
      {/* Left section (can be empty or add navigation later) */}
      <div className="flex items-center flex-1">
        {/* <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Image src="/adpopcorn-logo.svg" alt="Adpopcorn Logo" width={24} height={24} /> 
          <span>Dashboard</span>
        </Link> */}
      </div>

      {/* Center section for Logo */}
      <div className="flex flex-1 justify-center">
        <Link href="/dashboard">
          <Image 
            src="/adpopcorn-logo.png"
            alt="Adpopcorn Logo" 
            width={150} // Adjust width as needed
            height={40} // Adjust height to fit within the header
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
