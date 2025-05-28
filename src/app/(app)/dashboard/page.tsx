
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Eye, Trash2, ListChecks, MoreHorizontal, Edit, CheckCircle, XCircle, Clock, Loader2, ChevronLeft, ChevronRight, FileEdit, ExternalLink, Search } from 'lucide-react';
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
import { collection, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ADMIN_EMAIL = 'jirrral@gmail.com';
const STATUS_OPTIONS = ["Pending", "In Progress", "On Hold", "Resolved", "Closed", "Requires Info"];
const ITEMS_PER_PAGE = 20;

interface FlattenedDataRow extends SubmittedInquiryDataRow {
  key: string; // Unique key for React list
  originalInquiryId: string;
  originalInquirySubmittedAt: string;
  originalInquiryUserId?: string;
  originalInquirySource?: 'excel' | 'direct';
  originalInquiryFileName?: string;
  originalDataRowIndex: number; // Index within the original inquiry's data array
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submittedInquiries, setSubmittedInquiries] = useState<SubmittedInquiry[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // For bulk status update
  const [selectedRows, setSelectedRows] = useState<Map<string, FlattenedDataRow>>(new Map());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);


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
      const fetchedInquiries = querySnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        let submittedAtStr = '';
        if (data.submittedAt instanceof Timestamp) {
          submittedAtStr = data.submittedAt.toDate().toISOString();
        } else if (typeof data.submittedAt === 'string') {
          submittedAtStr = data.submittedAt;
        } else if (data.submittedAt && typeof data.submittedAt.toDate === 'function') {
           submittedAtStr = data.submittedAt.toDate().toISOString();
        } else {
            console.warn(`[Dashboard] Document ${docSnapshot.id} has invalid submittedAt:`, data.submittedAt);
            submittedAtStr = new Date(0).toISOString(); 
        }

        const processedDataArray = (Array.isArray(data.data) ? data.data : []).map((item: Partial<SubmittedInquiryDataRow>) => ({
            campaignKey: item.campaignKey || '',
            campaignName: item.campaignName || '',
            adidOrIdfa: item.adidOrIdfa || '',
            userName: item.userName || '',
            contact: item.contact || '',
            remarks: item.remarks || '',
            status: item.status || "Pending", 
            adminNotes: item.adminNotes || '',
        }));

        return {
          id: docSnapshot.id, 
          userId: data.userId,
          source: data.source,
          fileName: data.fileName,
          data: processedDataArray,
          submittedAt: submittedAtStr,
        } as SubmittedInquiry;
      });
      setSubmittedInquiries(fetchedInquiries);
      setIsLoadingInquiries(false);
      setCurrentPage(1); 
      setSelectedRows(new Map()); // Reset selection on new data
    }, (error) => {
      console.error("[Dashboard] Error fetching inquiries: ", error);
      toast({ title: "Error", description: "Could not fetch submitted inquiries.", variant: "destructive" });
      setIsLoadingInquiries(false);
    });

    return () => {
      console.log("[Dashboard] Unsubscribing from inquiries snapshot listener.");
      unsubscribe();
    };
  }, [user?.id, isAdmin, toast]); 

  const flattenedDataRows: FlattenedDataRow[] = useMemo(() => {
    return submittedInquiries.flatMap((inquiry) =>
      (Array.isArray(inquiry.data) ? inquiry.data : []).map((dataRow, dataRowIndex) => ({
        ...dataRow,
        key: `${inquiry.id}-row-${dataRowIndex}`, // Unique key for React list
        originalInquiryId: inquiry.id,
        originalInquirySubmittedAt: inquiry.submittedAt,
        originalInquiryUserId: inquiry.userId,
        originalInquirySource: inquiry.source,
        originalInquiryFileName: inquiry.fileName,
        originalDataRowIndex: dataRowIndex,
      }))
    );
  }, [submittedInquiries]);

  const totalItems = flattenedDataRows.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const paginatedDataRows = useMemo(() => {
    if (totalItems === 0) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return flattenedDataRows.slice(startIndex, endIndex);
  }, [flattenedDataRows, currentPage, totalItems]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0 && totalItems === 0 && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage, totalItems]);

  const handleIndividualStatusChange = async (inquiryId: string, dataRowIndex: number, newStatus: string) => {
    if (!isAdmin) {
        toast({ title: "Unauthorized", description: "Only admins can change status.", variant: "destructive" });
        return;
    }
    try {
        const inquiryRef = doc(firestore, "inquiries", inquiryId);
        // Fetch the latest document data to avoid overwriting concurrent changes
        const docSnap = await getDoc(inquiryRef);
        if (!docSnap.exists()) {
            toast({ title: "Error", description: "Inquiry not found in database.", variant: "destructive" });
            return;
        }
        const currentInquiryData = docSnap.data()?.data as SubmittedInquiryDataRow[];
        if (!currentInquiryData) {
            toast({ title: "Error", description: "Inquiry data is missing or malformed.", variant: "destructive" });
            return;
        }

        const newDataArray = [...currentInquiryData];
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
  
  const handleRowSelectionChange = (row: FlattenedDataRow, checked: boolean | 'indeterminate') => {
    setSelectedRows(prev => {
      const newSelectedRows = new Map(prev);
      if (checked === true) {
        newSelectedRows.set(row.key, row);
      } else {
        newSelectedRows.delete(row.key);
      }
      return newSelectedRows;
    });
  };

  const handleSelectAllOnPage = (checked: boolean | 'indeterminate') => {
    setSelectedRows(prev => {
      const newSelectedRows = new Map(prev);
      if (checked === true) {
        paginatedDataRows.forEach(row => newSelectedRows.set(row.key, row));
      } else {
        paginatedDataRows.forEach(row => newSelectedRows.delete(row.key));
      }
      return newSelectedRows;
    });
  };

  const handleBulkStatusUpdate = async () => {
    if (selectedRows.size === 0) {
      toast({ title: "No items selected", description: "Please select items to update.", variant: "destructive" });
      return;
    }
    if (!bulkStatus) {
      toast({ title: "No status selected", description: "Please select a status to apply.", variant: "destructive" });
      return;
    }
    if (!isAdmin) {
      toast({ title: "Unauthorized", description: "Only admins can change status.", variant: "destructive" });
      return;
    }

    setIsBulkUpdating(true);
    const batch = writeBatch(firestore);
    const updatesByInquiryId = new Map<string, { inquiryRef: any, updatedDataArray: SubmittedInquiryDataRow[] }>();

    // Group updates by original inquiry ID
    for (const row of selectedRows.values()) {
      if (!updatesByInquiryId.has(row.originalInquiryId)) {
        const inquiryRef = doc(firestore, "inquiries", row.originalInquiryId);
        const docSnap = await getDoc(inquiryRef); // Get current data
        if (docSnap.exists()) {
           updatesByInquiryId.set(row.originalInquiryId, {
            inquiryRef,
            updatedDataArray: [...(docSnap.data()?.data as SubmittedInquiryDataRow[] || [])] // Start with current data
          });
        } else {
          console.warn(`Document ${row.originalInquiryId} not found for bulk update of row ${row.key}`);
          continue; 
        }
      }
      
      const inquiryUpdate = updatesByInquiryId.get(row.originalInquiryId);
      if (inquiryUpdate && inquiryUpdate.updatedDataArray[row.originalDataRowIndex]) {
        inquiryUpdate.updatedDataArray[row.originalDataRowIndex].status = bulkStatus;
      }
    }
    
    // Add all updates to the batch
    updatesByInquiryId.forEach(({ inquiryRef, updatedDataArray }) => {
      batch.update(inquiryRef, { data: updatedDataArray });
    });

    try {
      await batch.commit();
      toast({ title: "Bulk Status Update Successful", description: `${selectedRows.size} items updated to ${bulkStatus}.` });
      setSelectedRows(new Map()); // Clear selection
      setBulkStatus(''); // Reset dropdown
    } catch (error) {
      console.error("Error in bulk status update:", error);
      toast({ title: "Bulk Update Failed", description: "Could not update all selected items.", variant: "destructive" });
    } finally {
      setIsBulkUpdating(false);
    }
  };


  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages || 1));
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
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

    switch (status?.toLowerCase()) {
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
        variant = "secondary"; 
        icon = <ListChecks className="mr-1 h-3 w-3 text-muted-foreground" />
    }
    return <Badge variant={variant} className="capitalize text-xs py-0.5 px-1.5 flex items-center w-fit">{icon} {status || 'N/A'}</Badge>;
  };


  const isAllOnPageSelected = paginatedDataRows.length > 0 && paginatedDataRows.every(row => selectedRows.has(row.key));
  const isSomeOnPageSelected = paginatedDataRows.some(row => selectedRows.has(row.key)) && !isAllOnPageSelected;


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

        {isAdmin && (
          <Card className="mb-6 shadow-sm border-dashed bg-muted/30">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-base">Bulk Status Update</CardTitle>
              <CardDescription className="text-xs">Select items from the table below, choose a status, and click save.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row items-center gap-3">
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="w-full sm:w-[200px] h-9">
                  <SelectValue placeholder="Select status to apply" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(statusOption => (
                    <SelectItem key={statusOption} value={statusOption}>
                      {statusOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleBulkStatusUpdate} 
                disabled={isBulkUpdating || selectedRows.size === 0 || !bulkStatus}
                size="sm"
                className="w-full sm:w-auto"
              >
                {isBulkUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Status for ({selectedRows.size}) Items
              </Button>
            </CardContent>
          </Card>
        )}


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
        ) : flattenedDataRows.length === 0 ? (
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
          <>
            <Card className="shadow-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-[30px] px-2 py-2 text-center">
                        <Checkbox 
                          checked={isAllOnPageSelected || (isSomeOnPageSelected ? "indeterminate" : false)}
                          onCheckedChange={handleSelectAllOnPage}
                          aria-label="Select all items on this page"
                        />
                      </TableHead>
                    )}
                    <TableHead className="w-[10%]">Submitted Date</TableHead>
                    <TableHead className="w-[10%]">Campaign Key</TableHead>
                    <TableHead className="w-[15%]">Campaign Name</TableHead>
                    <TableHead className="w-[10%]">ADID/IDFA</TableHead>
                    <TableHead className="w-[8%]">User Name</TableHead>
                    <TableHead className="w-[10%]">Contact</TableHead>
                    <TableHead className="w-[12%]">Remarks</TableHead>
                    <TableHead className="w-[10%] text-center">Status</TableHead>
                    {isAdmin && <TableHead className="w-[5%] text-xs text-center">Edit</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDataRows.map((row) => (
                    <TableRow key={row.key} className="text-xs hover:bg-muted/50" data-state={selectedRows.has(row.key) ? "selected" : ""}>
                       {isAdmin && (
                        <TableCell className="px-2 py-1 text-center">
                           <Checkbox 
                            checked={selectedRows.has(row.key)}
                            onCheckedChange={(checked) => handleRowSelectionChange(row, checked)}
                            aria-labelledby={`label-select-row-${row.key}`}
                           />
                           <span id={`label-select-row-${row.key}`} className="sr-only">Select row for campaign key {row.campaignKey}</span>
                        </TableCell>
                      )}
                      <TableCell className="font-medium py-2">
                        {row.originalInquirySubmittedAt ? format(new Date(row.originalInquirySubmittedAt), "yyyy-MM-dd") : 'N/A'}
                      </TableCell>
                      <TableCell className="py-2 truncate max-w-[100px]">{row.campaignKey}</TableCell>
                      <TableCell className="py-2 truncate max-w-[120px]">{row.campaignName}</TableCell>
                      <TableCell className="py-2 truncate max-w-[100px]">{row.adidOrIdfa}</TableCell>
                      <TableCell className="py-2 truncate max-w-[80px]">{row.userName}</TableCell>
                      <TableCell className="py-2 truncate max-w-[90px]">{row.contact}</TableCell>
                      <TableCell className="py-2 truncate max-w-[100px]">{row.remarks}</TableCell>
                      <TableCell className="py-2 text-center">{renderStatusBadge(row.status)}</TableCell>
                      {isAdmin && (
                        <TableCell className="py-2 text-center">
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
                                      onValueChange={(newStatus) => handleIndividualStatusChange(row.originalInquiryId, row.originalDataRowIndex, newStatus)}
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
            </Card>
            {totalItems > 0 && (
              <div className="flex items-center justify-end space-x-2 py-4 mt-4 border-t pt-4">
                <span className="text-sm text-muted-foreground">
                  Page {totalPages > 0 ? currentPage : 0} of {totalPages > 0 ? totalPages : 0}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages || totalItems === 0}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <InquiryModal open={isInquiryModalOpen} onOpenChange={setIsInquiryModalOpen} />
    </div>
  );
}

    