
import Link from 'next/link';
import { UserNav } from './UserNav';
// import Image from 'next/image'; // Commented out as Image is no longer used

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card px-2 sm:px-4"> {/* Reduced horizontal padding */}
      {/* Removed the Link and Image components for the logo */}
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
