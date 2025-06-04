import { useState, useEffect } from 'react';
import { fetchAdminEmail } from '@/lib/adminEmail';

export function useAdminEmail() {
  const [adminEmail, setAdminEmail] = useState<string | undefined>(
    process.env.NEXT_PUBLIC_ADMIN_EMAIL
  );

  useEffect(() => {
    if (!adminEmail) {
      fetchAdminEmail().then((email) => {
        if (email) {
          setAdminEmail(email);
        }
      });
    }
  }, [adminEmail]);

  return adminEmail;
}
