"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useAdminEmail } from '@/hooks/use-admin-email';
import { useMemo } from 'react';

export default function AdminPage() {
  const { user } = useAuth();
  const adminEmail = useAdminEmail();
  const isAdmin = useMemo(() => user?.email === adminEmail, [user?.email, adminEmail]);

  if (!isAdmin) {
    return <div className="mt-10 text-center">접근 권한이 없습니다.</div>;
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">어드민 페이지</h1>
      <p>관리자만 볼 수 있는 페이지입니다.</p>
    </div>
  );
}
