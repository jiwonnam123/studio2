"use client";

import { FormBuilder } from '@/components/forms/FormBuilder';
import { getFormById } from '@/lib/formStore';
import type { FormDefinition } from '@/types';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from 'lucide-react';

export default function EditFormPage({ params }: { params: { formId: string } }) {
  const [form, setForm] = useState<FormDefinition | null | undefined>(undefined); // undefined for loading, null for not found
  const router = useRouter();

  useEffect(() => {
    const existingForm = getFormById(params.formId);
    if (existingForm) {
      setForm(existingForm);
    } else {
      setForm(null); // Mark as not found
    }
  }, [params.formId]);

  if (form === undefined) {
    return (
      <div>
        <Skeleton className="h-10 w-1/2 mb-2" />
        <Skeleton className="h-6 w-3/4 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (form === null) {
    return (
       <div className="flex flex-col items-center justify-center h-full">
          <Alert variant="destructive" className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Form Not Found</AlertTitle>
            <AlertDescription>
              The form you are trying to edit does not exist or could not be loaded.
              You can try <Link href="/dashboard" className="underline">going back to the dashboard</Link>.
            </AlertDescription>
          </Alert>
        </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit Form: {form.title}</h1>
        <p className="text-muted-foreground">
          Modify your form structure, fields, and settings.
        </p>
      </div>
      <FormBuilder existingForm={form} />
    </div>
  );
}

// Helper Link for the Alert, as Next/Link is client-side
import NextLink from 'next/link';
const Link = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
  <NextLink href={href} className={className}>
    {children}
  </NextLink>
);
