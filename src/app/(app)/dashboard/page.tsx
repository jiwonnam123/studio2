
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Filter, Edit3, Eye, Copy, Trash2, Share2, FileText, ListChecks, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { FormDefinition, SubmittedInquiry } from '@/types'; // SubmittedInquiry added
import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
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
import { InquiryModal } from '@/components/modals/inquiry/InquiryModal';
import { useAuth } from '@/contexts/AuthContext'; // Added for user ID
import { firestore } from '@/lib/firebase'; // Added for Firestore
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore'; // Added Firestore functions
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

const FORMS_STORAGE_KEY = 'formflow_forms';

export default function DashboardPage() {
  const { user } = useAuth(); // Get current user
  const [forms, setForms] = useLocalStorage<FormDefinition[]>(FORMS_STORAGE_KEY, []);
  const [submittedInquiries, setSubmittedInquiries] = useState<SubmittedInquiry[]>([]); // State for inquiries
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true); // Loading state for inquiries
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);

  useEffect(() => {
    setMounted(true); 
  }, []);

  // Fetch submitted inquiries from Firestore
  useEffect(() => {
    if (user?.id) {
      setIsLoadingInquiries(true);
      const inquiriesRef = collection(firestore, "inquiries");
      const q = query(
        inquiriesRef,
        where("userId", "==", user.id),
        orderBy("submittedAt", "desc")
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const fetchedInquiries = querySnapshot.docs.map(doc => {
          const data = doc.data();
          // Ensure submittedAt is converted from Firestore Timestamp to ISO string
          let submittedAtStr = '';
          if (data.submittedAt instanceof Timestamp) {
            submittedAtStr = data.submittedAt.toDate().toISOString();
          } else if (typeof data.submittedAt === 'string') { // Handle if it's already a string (e.g. from older data)
            submittedAtStr = data.submittedAt;
          } else if (data.submittedAt && typeof data.submittedAt.toDate === 'function') { // Handle other Timestamp-like objects
             submittedAtStr = data.submittedAt.toDate().toISOString();
          }


          return {
            id: doc.id,
            userId: data.userId,
            source: data.source,
            fileName: data.fileName,
            data: data.data,
            submittedAt: submittedAtStr,
          } as SubmittedInquiry;
        });
        setSubmittedInquiries(fetchedInquiries);
        setIsLoadingInquiries(false);
      }, (error) => {
        console.error("Error fetching inquiries: ", error);
        toast({ title: "Error", description: "Could not fetch submitted inquiries.", variant: "destructive" });
        setIsLoadingInquiries(false);
      });

      return () => unsubscribe(); // Cleanup listener on unmount
    } else {
      setSubmittedInquiries([]); // Clear inquiries if no user
      setIsLoadingInquiries(false);
    }
  }, [user?.id]);

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
       <div className="space-y-8 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-1/3 rounded" />
        </div>
         <div className="animate-pulse space-y-2">
            <Skeleton className="h-8 w-1/4 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <Skeleton className="h-6 w-3/4 rounded bg-muted" />
                <Skeleton className="h-4 w-1/2 rounded bg-muted mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full rounded bg-muted" />
                <Skeleton className="h-4 w-2/3 rounded bg-muted mt-1" />
              </CardContent>
              <CardFooter className="flex justify-between">
                 <Skeleton className="h-8 w-20 rounded bg-muted" />
                 <Skeleton className="h-8 w-20 rounded bg-muted" />
              </CardFooter>
            </Card>
          ))}
        </div>
        <div className="animate-pulse space-y-2 mt-8">
            <Skeleton className="h-8 w-1/3 rounded" />
            <Skeleton className="h-4 w-3/4 rounded" />
        </div>
        <Skeleton className="h-40 w-full rounded bg-muted mt-4" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* My Forms Section */}
      <section>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Forms</h1>
            <p className="text-muted-foreground">
              Manage, edit, and view submissions for your forms.
            </p>
          </div>
          <Button onClick={() => router.push('/forms/create')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Form (Legacy)
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-6">
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

        {filteredForms.length === 0 && !searchTerm ? (
          <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-xl font-semibold">No Forms Created Yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Get started by creating your first form.
            </p>
             <Button variant="link" className="p-0 h-auto text-base mt-2" onClick={() => router.push('/forms/create')}>
              Create a new form
            </Button>
          </div>
        ) : filteredForms.length === 0 && searchTerm ? (
           <div className="text-center py-10">
              <h3 className="text-xl font-semibold">No forms found</h3>
              <p className="text-muted-foreground">Try adjusting your search.</p>
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
      </section>

      {/* My Submitted Inquiries Section */}
      <section className="mt-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">My Submitted Inquiries</h2>
            <p className="text-muted-foreground">
              View and manage your submitted inquiry data.
            </p>
          </div>
           <Button onClick={() => setIsInquiryModalOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Submit New Inquiry
          </Button>
        </div>

        {isLoadingInquiries ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-10 w-full rounded" />
          </div>
        ) : submittedInquiries.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
            <ListChecks className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-xl font-semibold">No Inquiries Submitted Yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the button above to submit your first inquiry.
            </p>
          </div>
        ) : (
          <Card>
            <Table>
              <TableCaption>A list of your submitted inquiries.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>File Name / Details</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submittedInquiries.map((inquiry) => (
                  <TableRow key={inquiry.id}>
                    <TableCell>
                      {inquiry.submittedAt ? format(new Date(inquiry.submittedAt), "PPpp") : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inquiry.source === 'excel' ? 'secondary' : 'outline'}>
                        {inquiry.source === 'excel' ? 'Excel' : 'Direct Entry'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                        {inquiry.source === 'excel' && inquiry.fileName ? inquiry.fileName : 
                         inquiry.source === 'direct' ? 'Manual Input' : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">{inquiry.data.length}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled>
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </DropdownMenuItem>
                           <DropdownMenuItem disabled className="text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Inquiry
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
      
      <InquiryModal open={isInquiryModalOpen} onOpenChange={setIsInquiryModalOpen} />
    </div>
  );
}
