
"use client";

import React, { useEffect, useState, useMemo } from 'react'; // Added React import
import { Button } from '@/components/ui/button';
import { PlusCircle, Eye, Trash2, ListChecks, MoreHorizontal, Edit, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SubmittedInquiry, SubmittedInquiryDataRow } from '@/types';
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
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { InquiryModal } from '@/components/modals/inquiry/InquiryModal';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const ADMIN_EMAIL = 'jirrral@gmail.com';
const STATUS_OPTIONS = ["Pending", "In Progress", "On Hold", "Resolved", "Closed", "Requires Info"];

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submittedInquiries, setSubmittedInquiries] = useState<SubmittedInquiry[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);

  const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user?.email]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setSubmittedInquiries([]);
      setIsLoadingInquiries(false);
      return;
    }

    setIsLoadingInquiries(true);
    const inquiriesRef = collection(firestore, "inquiries");
    let q;

    if (isAdmin) {
      console.log("[Dashboard] Admin user detected. Fetching all inquiries.");
      q = query(inquiriesRef, orderBy("submittedAt", "desc"));
    } else {
      console.log("[Dashboard] Normal user detected. Fetching user-specific inquiries for userId:", user.id);
      q = query(
        inquiriesRef,
        where("userId", "==", user.id),
        orderBy("submittedAt", "desc")
      );
    }

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log(`[Dashboard] onSnapshot triggered. Found ${querySnapshot.docs.length} documents.`);
      const fetchedInquiries = querySnapshot.docs.map(docSnapshot => { // Renamed doc to docSnapshot to avoid conflict
        const data = docSnapshot.data();
        let submittedAtStr = '';
        if (data.submittedAt instanceof Timestamp) {
          submittedAtStr = data.submittedAt.toDate().toISOString();
        } else if (typeof data.submittedAt === 'string') {
          // This case should ideally not happen if submittedAt is always a serverTimestamp
          // but handle it defensively.
          submittedAtStr = data.submittedAt;
        } else if (data.submittedAt && typeof data.submittedAt.toDate === 'function') {
           submittedAtStr = data.submittedAt.toDate().toISOString();
        } else {
            console.warn(`[Dashboard] Document ${docSnapshot.id} has invalid submittedAt:`, data.submittedAt);
            submittedAtStr = new Date(0).toISOString(); // Fallback for invalid date
        }

        // Ensure data array and its items have status
        const processedDataArray = (Array.isArray(data.data) ? data.data : []).map((item: Partial<SubmittedInquiryDataRow>) => ({
            campaignKey: item.campaignKey || '',
            campaignName: item.campaignName || '',
            adidOrIdfa: item.adidOrIdfa || '',
            userName: item.userName || '',
            contact: item.contact || '',
            remarks: item.remarks || '',
            status: item.status || "Pending", // Default to Pending if status is missing
            adminNotes: item.adminNotes || '',
        }));

        return {
          id: docSnapshot.id, // Use docSnapshot.id here
          userId: data.userId,
          source: data.source,
          fileName: data.fileName,
          data: processedDataArray,
          submittedAt: submittedAtStr,
        } as SubmittedInquiry;
      });
      setSubmittedInquiries(fetchedInquiries);
      setIsLoadingInquiries(false);
    }, (error) => {
      console.error("[Dashboard] Error fetching inquiries: ", error);
      toast({ title: "Error", description: "Could not fetch submitted inquiries.", variant: "destructive" });
      setIsLoadingInquiries(false);
    });

    return () => {
      console.log("[Dashboard] Unsubscribing from inquiries snapshot listener.");
      unsubscribe();
    };
  }, [user?.id, isAdmin, toast]); // Added toast to dependency array as it's used in error callback

  const handleStatusChange = async (inquiryId: string, dataRowIndex: number, newStatus: string) => {
    if (!isAdmin) {
        toast({ title: "Unauthorized", description: "Only admins can change status.", variant: "destructive" });
        return;
    }
    try {
        const inquiryRef = doc(firestore, "inquiries", inquiryId);
        const currentInquiry = submittedInquiries.find(inq => inq.id === inquiryId);
        if (!currentInquiry) {
            toast({ title: "Error", description: "Inquiry not found locally.", variant: "destructive" });
            return;
        }

        const newDataArray = [...currentInquiry.data];
        if (newDataArray[dataRowIndex]) {
            newDataArray[dataRowIndex] = { ...newDataArray[dataRowIndex], status: newStatus };
            await updateDoc(inquiryRef, { data: newDataArray });
            toast({ title: "Status Updated", description: `Status changed to ${newStatus}.` });
        } else {
            toast({ title: "Error", description: "Data row index out of bounds.", variant: "destructive" });
        }
    } catch (error) {
        console.error("Error updating status:", error);
        toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    }
  };
  
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

  const renderStatusBadge = (status: string) => {
    let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
    let icon = <Clock className="mr-1 h-3 w-3" />;

    switch (status.toLowerCase()) {
      case "pending":
        variant = "outline";
        icon = <Clock className="mr-1 h-3 w-3 text-yellow-500" />;
        break;
      case "in progress":
        variant = "secondary";
        icon = <Loader2 className="mr-1 h-3 w-3 animate-spin text-blue-500" />;
        break;
      case "resolved":
      case "closed":
        variant = "default"; 
        icon = <CheckCircle className="mr-1 h-3 w-3 text-green-500" />;
        break;
      case "on hold":
        variant = "outline";
        icon = <Clock className="mr-1 h-3 w-3 text-orange-500" />;
        break;
      case "requires info":
         variant = "destructive";
         icon = <XCircle className="mr-1 h-3 w-3 text-red-500" />;
        break;
      default:
        variant = "secondary"; // Default for unknown statuses
        icon = <ListChecks className="mr-1 h-3 w-3 text-muted-foreground" />
    }
    return <Badge variant={variant} className="capitalize text-xs py-0.5 px-1.5 flex items-center w-fit">{icon} {status}</Badge>;
  };


  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Submitted Inquiries</h1>
            <p className="text-muted-foreground">
              View and manage your submitted inquiry data. {isAdmin && <Badge variant="secondary" className="ml-2">Admin View</Badge>}
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
                  {isAdmin && <TableHead>User ID</TableHead>}
                  <TableHead>Source</TableHead>
                  <TableHead>File Name / Details</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submittedInquiries.map((inquiry) => (
                  <React.Fragment key={inquiry.id}>
                    <TableRow className="bg-muted/10 hover:bg-muted/20">
                      <TableCell className="font-medium">
                        {inquiry.submittedAt ? format(new Date(inquiry.submittedAt), "yyyy-MM-dd HH:mm") : 'N/A'}
                      </TableCell>
                      {isAdmin && <TableCell className="text-xs truncate max-w-[100px]">{inquiry.userId}</TableCell>}
                      <TableCell>
                        <Badge variant={inquiry.source === 'excel' ? 'secondary' : 'outline'} className="capitalize">
                          {inquiry.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                          {inquiry.source === 'excel' && inquiry.fileName ? inquiry.fileName :
                           inquiry.source === 'direct' ? 'Manual Input' : 'N/A'}
                      </TableCell>
                      <TableCell>{Array.isArray(inquiry.data) ? inquiry.data.length : 0}</TableCell>
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
                              <Eye className="mr-2 h-4 w-4" /> View Full Inquiry
                            </DropdownMenuItem>
                             <DropdownMenuItem disabled className="text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Inquiry
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {/* Data Rows for this inquiry */}
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 6 : 5} className="p-0">
                        <div className="px-2 py-1 bg-background">
                           <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead className="w-[15%] text-xs h-8">Campaign Key</TableHead>
                                    <TableHead className="w-[20%] text-xs h-8">Campaign Name</TableHead>
                                    <TableHead className="w-[15%] text-xs h-8">ADID/IDFA</TableHead>
                                    <TableHead className="w-[12%] text-xs h-8">User Name</TableHead>
                                    <TableHead className="w-[13%] text-xs h-8">Contact</TableHead>
                                    <TableHead className="w-[15%] text-xs h-8">Remarks</TableHead>
                                    <TableHead className="w-[10%] text-xs h-8 text-center">Status</TableHead>
                                    {isAdmin && <TableHead className="w-[5%] text-xs h-8 text-center">Edit</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.isArray(inquiry.data) && inquiry.data.map((row, rowIndex) => (
                                    <TableRow key={`${inquiry.id}-row-${rowIndex}`} className="text-xs hover:bg-muted/5">
                                        <TableCell className="py-1.5 truncate max-w-[100px]">{row.campaignKey}</TableCell>
                                        <TableCell className="py-1.5 truncate max-w-[120px]">{row.campaignName}</TableCell>
                                        <TableCell className="py-1.5 truncate max-w-[100px]">{row.adidOrIdfa}</TableCell>
                                        <TableCell className="py-1.5 truncate max-w-[80px]">{row.userName}</TableCell>
                                        <TableCell className="py-1.5 truncate max-w-[90px]">{row.contact}</TableCell>
                                        <TableCell className="py-1.5 truncate max-w-[100px]">{row.remarks}</TableCell>
                                        <TableCell className="py-1.5 text-center">{renderStatusBadge(row.status)}</TableCell>
                                        {isAdmin && (
                                          <TableCell className="py-1.5 text-center">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuRadioGroup 
                                                        value={row.status}
                                                        onValueChange={(newStatus) => handleStatusChange(inquiry.id, rowIndex, newStatus)}
                                                    >
                                                        {STATUS_OPTIONS.map(statusOption => (
                                                            <DropdownMenuRadioItem key={statusOption} value={statusOption}>
                                                                {statusOption}
                                                            </DropdownMenuRadioItem>
                                                        ))}
                                                    </DropdownMenuRadioGroup>
                                                    {/* TODO: Add Admin Notes UI */}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                          </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                           </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
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
