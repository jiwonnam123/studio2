
import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card px-2 sm:px-4"> {/* Reduced horizontal padding */}
      <Link href="/dashboard" className="flex items-center"> {/* Simplified Link className */}
        <Image
            src="/adpopcorn-logo.svg"
            alt="Adpopcorn Logo"
            width={200}
            height={30}
            priority
          />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
