
import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card px-4 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Image src="https://placehold.co/150x28.png" alt="Adpopcorn Logo" width={150} height={28} data-ai-hint="Adpopcorn logo" />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
