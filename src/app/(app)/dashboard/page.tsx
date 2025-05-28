
"use client";

import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Eye, Trash2, ListChecks, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SubmittedInquiry } from '@/types';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { InquiryModal } from '@/components/modals/inquiry/InquiryModal';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { user } = useAuth();
  const [submittedInquiries, setSubmittedInquiries] = useState<SubmittedInquiry[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);

  useEffect(() => {
    setMounted(true); 
  }, []);

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
          let submittedAtStr = '';
          if (data.submittedAt instanceof Timestamp) {
            submittedAtStr = data.submittedAt.toDate().toISOString();
          } else if (typeof data.submittedAt === 'string') {
            submittedAtStr = data.submittedAt;
          } else if (data.submittedAt && typeof data.submittedAt.toDate === 'function') {
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

      return () => unsubscribe();
    } else {
      setSubmittedInquiries([]);
      setIsLoadingInquiries(false);
    }
  }, [user?.id]);

  if (!mounted) {
    return (
       <div className="space-y-8 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-1/3 rounded" />
           <Skeleton className="h-10 w-36 rounded" /> 
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
      {/* My Submitted Inquiries Section */}
      <section>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Submitted Inquiries</h1>
            <p className="text-muted-foreground">
              View and manage your submitted inquiry data.
            </p>
          </div>
          <Button onClick={() => setIsInquiryModalOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Submit New Inquiry
          </Button>
        </div>

        {isLoadingInquiries ? (
          <Card>
             <CardHeader>
                <Skeleton className="h-8 w-1/2"/>
                <Skeleton className="h-4 w-3/4 mt-1"/>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
              </div>
            </CardContent>
          </Card>
        ) : submittedInquiries.length === 0 ? (
          <Card>
            <CardHeader>
                <CardTitle>No Inquiries Submitted Yet</CardTitle>
                <CardDescription>Click "Submit New Inquiry" to get started.</CardDescription>
            </CardHeader>
            <CardContent className="text-center py-10">
              <ListChecks className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-xl font-semibold">No data to display</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                You haven't submitted any inquiries yet.
              </p>
            </CardContent>
          </Card>
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
                    <TableCell className="text-right">{Array.isArray(inquiry.data) ? inquiry.data.length : 0}</TableCell>
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
