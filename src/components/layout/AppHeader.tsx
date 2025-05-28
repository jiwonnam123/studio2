
import Link from 'next/link';
import { UserNav } from './UserNav';
// import Image from 'next/image'; // No longer using next/image for logo here
import { AdpopcornLogoIcon } from '@/components/icons/AdpopcornLogoIcon';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card px-4 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        {/* Replace Image with SVG component */}
        <AdpopcornLogoIcon width="150" height="24" className="text-foreground" />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
