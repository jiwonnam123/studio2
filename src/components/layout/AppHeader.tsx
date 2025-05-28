
import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card px-2 sm:px-4">
      <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold md:text-base">
        <Image
          src="/adpopcorn-logo.svg" 
          alt="애드팝콘 로고"
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
