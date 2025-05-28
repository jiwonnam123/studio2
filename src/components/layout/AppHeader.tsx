
import Link from 'next/link';
import { UserNav } from './UserNav';
import Image from 'next/image';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card px-2 sm:px-4">
      {/* 로고 이미지 링크 제거 */}
      <div className="ml-auto flex items-center gap-2">
        <UserNav />
      </div>
    </header>
  );
}
