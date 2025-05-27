import Link from 'next/link';
import { UserNav } from './UserNav';
import { MountainIcon } from 'lucide-react';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card px-4 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <MountainIcon className="h-6 w-6 text-primary" />
        <span className="">FormFlow</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
