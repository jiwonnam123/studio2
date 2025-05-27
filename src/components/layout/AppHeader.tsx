import Link from 'next/link';
import { UserNav } from './UserNav';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { MountainIcon } from 'lucide-react';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <SidebarTrigger className="sm:hidden" />
      <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
        <MountainIcon className="h-6 w-6 text-primary" />
        <span className="">FormFlow</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
