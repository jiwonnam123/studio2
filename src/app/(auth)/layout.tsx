import React from 'react';
import { MountainIcon } from 'lucide-react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
       <div className="absolute top-8 left-8">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <MountainIcon className="h-7 w-7 text-primary" />
          <span>FormFlow</span>
        </Link>
      </div>
      <div className="w-full max-w-md">
        {children}
      </div>
       <footer className="absolute bottom-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} FormFlow. All rights reserved.
      </footer>
    </div>
  );
}
