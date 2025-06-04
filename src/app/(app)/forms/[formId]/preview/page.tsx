"use client";

import { DynamicForm } from '@/components/forms/DynamicForm';
import { getFormById } from '@/lib/formStore';
import type { FormDefinition } from '@/types';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Edit3 } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription as ShadcnAlertDescription } from "@/components/ui/alert";


export default function PreviewFormPage({ params }: { params: { formId: string } }) {
  const [formDef, setFormDef] = useState<FormDefinition | null | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    const fetchedForm = getFormById(params.formId);
    if (fetchedForm) {
      setFormDef(fetchedForm);
    } else {
      setFormDef(null); // Form not found
    }
  }, [params.formId]);

  if (formDef === undefined) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Skeleton className="h-10 w-3/4 mb-2" />
        <Skeleton className="h-6 w-1/2 mb-8" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2 mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
            <Skeleton className="h-10 w-1/3 mt-4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (formDef === null) {
    return (
       <div className="container mx-auto py-8 px-4 flex flex-col items-center justify-center h-[calc(100vh-200px)]">
          <Alert variant="destructive" className="max-w-lg text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
            <AlertTitle className="text-xl">Form Not Found</AlertTitle>
            <ShadcnAlertDescription className="text-base">
              The form you are trying to preview does not exist.
            </ShadcnAlertDescription>
             <Button variant="outline" onClick={() => router.push('/dashboard')} className="mt-4">
              Go to Dashboard
            </Button>
          </Alert>
        </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Preview: {formDef.title}</h1>
          <p className="text-muted-foreground">
            This is how your form will look to users. No data will be saved from this preview.
          </p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
                Back
            </Button>
            <Link href={`/forms/${formDef.id}/edit`}>
                <Button>
                <Edit3 className="mr-2 h-4 w-4" /> Edit Form
                </Button>
            </Link>
        </div>
      </div>
      
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">{formDef.title}</CardTitle>
          {formDef.description && <CardDescription>{formDef.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <DynamicForm formDefinition={formDef} onSubmit={() => {
            // In preview, submit does nothing or shows a message
            alert("This is a preview. Form submission is disabled here.");
          }} isPreview={true} />
        </CardContent>
      </Card>
    </div>
  );
}
