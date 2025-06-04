"use client";

import { DynamicForm } from '@/components/forms/DynamicForm';
import { getFormById } from '@/lib/formStore';
import { saveSubmission } from '@/lib/submissionStore';
import type { FormDefinition, FormSubmission } from '@/types';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription as ShadcnAlertDescription } from "@/components/ui/alert";
import useLocalStorage from '@/hooks/useLocalStorage'; // To trigger re-render on submission save
import { useAuth } from '@/contexts/AuthContext';

const SUBMISSIONS_STORAGE_KEY = 'formflow_submissions';


export default function SubmitFormPage({ params }: { params: { formId: string } }) {
  const [formDef, setFormDef] = useState<FormDefinition | null | undefined>(undefined);
  const router = useRouter();
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setStoredSubmissions] = useLocalStorage<FormSubmission[]>(SUBMISSIONS_STORAGE_KEY, []);


  useEffect(() => {
    const fetchedForm = getFormById(params.formId);
     if (fetchedForm) {
      setFormDef(fetchedForm);
    } else {
      setFormDef(null); // Form not found
    }
  }, [params.formId]);

  const handleSubmit = async (data: Record<string, any>) => {
    if (!formDef) return;

    try {
      const submissionBase: Omit<FormSubmission, 'id' | 'submittedAt'> = {
        formId: formDef.id,
        data,
        userId: user?.id,
      };
      const newSubmission = saveSubmission(submissionBase);
      setStoredSubmissions(prev => [newSubmission, ...prev]);

      toast({
        title: "Form Submitted!",
        description: `Thank you for submitting "${formDef.title}".`,
      });
      router.push(`/submissions?formId=${formDef.id}`); // Or a thank you page
    } catch (error) {
      console.error("Error submitting form:", error);
      toast({
        title: "Submission Error",
        description: "Could not submit the form. Please try again.",
        variant: "destructive",
      });
    }
  };
  
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
              The form you are trying to access does not exist or is currently unavailable.
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
       <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Submit: {formDef.title}</h1>
            <p className="text-muted-foreground">
                Please fill out the form below.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
        </div>
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">{formDef.title}</CardTitle>
          {formDef.description && <CardDescription>{formDef.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <DynamicForm formDefinition={formDef} onSubmit={handleSubmit} />
        </CardContent>
      </Card>
    </div>
  );
}
