
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Filter, Edit3, Eye, Copy, Trash2, Share2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { FormDefinition } from '@/types';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { InquiryModal } from '@/components/modals/inquiry/InquiryModal'; // Added import

const FORMS_STORAGE_KEY = 'formflow_forms';

export default function DashboardPage() {
  const [forms, setForms] = useLocalStorage<FormDefinition[]>(FORMS_STORAGE_KEY, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false); // State for new modal

  useEffect(() => {
    setMounted(true); // Ensure localStorage is accessed only on client
  }, []);

  const handleDeleteForm = (formId: string) => {
    setForms(prevForms => prevForms.filter(form => form.id !== formId));
    toast({
      title: "Form Deleted",
      description: "The form has been successfully deleted.",
    });
  };
  
  const handleDuplicateForm = (formToDuplicate: FormDefinition) => {
    const newForm: FormDefinition = {
      ...formToDuplicate,
      id: crypto.randomUUID(),
      title: `${formToDuplicate.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setForms(prevForms => [...prevForms, newForm]);
    toast({
      title: "Form Duplicated",
      description: `Form "${newForm.title}" has been created.`,
    });
  };

  const filteredForms = forms.filter(form =>
    form.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    form.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!mounted) {
    return (
       <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
         <div className="animate-pulse space-y-2">
            <div className="h-8 w-1/3 rounded bg-muted"></div>
            <div className="h-4 w-1/2 rounded bg-muted"></div>
          </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 w-3/4 rounded bg-muted"></div>
                <div className="h-4 w-1/2 rounded bg-muted mt-1"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full rounded bg-muted"></div>
                <div className="h-4 w-2/3 rounded bg-muted mt-1"></div>
              </CardContent>
              <CardFooter className="flex justify-between">
                 <div className="h-8 w-20 rounded bg-muted"></div>
                 <div className="h-8 w-20 rounded bg-muted"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Forms</h1>
          <p className="text-muted-foreground">
            Manage, edit, and view submissions for your forms.
          </p>
        </div>
        {/* Modified Button to open InquiryModal */}
        <Button onClick={() => setIsInquiryModalOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create New Form
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search forms..."
            className="pl-8 sm:w-full md:w-1/2 lg:w-1/3"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" disabled>
          <Filter className="mr-2 h-4 w-4" /> Filter
        </Button>
      </div>

      {filteredForms.length === 0 ? (
        <div className="text-center py-10">
          <h3 className="text-xl font-semibold">No forms found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? "Try adjusting your search or " : ""}
            {/* Link inside paragraph for creating form - can also open modal */}
            <Button variant="link" className="p-0 h-auto text-base" onClick={() => setIsInquiryModalOpen(true)}>
              create a new form
            </Button>.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredForms.map(form => (
            <Card key={form.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="truncate text-xl">{form.title}</CardTitle>
                <CardDescription className="h-10 overflow-hidden text-ellipsis">
                  {form.description || 'No description available.'}
                </CardDescription>
                 <Badge variant="outline" className="w-fit">{form.fields.length} field{form.fields.length === 1 ? '' : 's'}</Badge>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground">
                  Last updated: {formatDistanceToNow(new Date(form.updatedAt), { addSuffix: true })}
                </p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 justify-start">
                <Link href={`/forms/${form.id}/edit`}>
                  <Button variant="outline" size="sm"><Edit3 className="mr-1 h-3 w-3" /> Edit</Button>
                </Link>
                <Link href={`/forms/${form.id}/preview`}>
                  <Button variant="outline" size="sm"><Eye className="mr-1 h-3 w-3" /> Preview</Button>
                </Link>
                 <Button variant="outline" size="sm" onClick={() => handleDuplicateForm(form)}>
                  <Copy className="mr-1 h-3 w-3" /> Duplicate
                </Button>
                <Link href={`/forms/${form.id}/submit`}>
                  <Button variant="default" size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Share2 className="mr-1 h-3 w-3" /> Submit / Share
                  </Button>
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm"><Trash2 className="mr-1 h-3 w-3" /> Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the form
                        &quot;{form.title}&quot; and all its associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteForm(form.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      {/* Inquiry Modal */}
      <InquiryModal open={isInquiryModalOpen} onOpenChange={setIsInquiryModalOpen} />
    </div>
  );
}
