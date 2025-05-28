
import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b bg-card px-4 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Image
            src="/adpopcorn-logo.svg"
            alt="Adpopcorn Logo"
            width={400}
            height={60}
            priority
          />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
