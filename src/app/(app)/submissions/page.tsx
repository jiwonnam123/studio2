"use client";

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSubmissions, deleteSubmission } from '@/lib/submissionStore';
import { getFormById, getForms } from '@/lib/formStore';
import type { FormSubmission, FormDefinition } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { MoreHorizontal, Trash2, Eye, Search, Filter, Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

export default function SubmissionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [allSubmissions, setAllSubmissions] = useState<FormSubmission[]>([]);
  const [allForms, setAllForms] = useState<FormDefinition[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(searchParams.get('formId') || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    setIsLoading(true);
    setAllSubmissions(getSubmissions());
    setAllForms(getForms());
    setIsLoading(false);
  }, []);
  
  const handleFormChange = (formId: string) => {
    setSelectedFormId(formId === 'all' ? null : formId);
    router.push(formId === 'all' ? '/submissions' : `/submissions?formId=${formId}`);
  };

  const handleDeleteSubmission = (submissionId: string) => {
    deleteSubmission(submissionId);
    setAllSubmissions(prev => prev.filter(s => s.id !== submissionId));
    toast({ title: "Submission Deleted", description: "The submission has been removed." });
  };
  
  const currentForm = useMemo(() => {
    return selectedFormId ? allForms.find(form => form.id === selectedFormId) : null;
  }, [selectedFormId, allForms]);


  const filteredSubmissions = useMemo(() => {
    let subs = selectedFormId ? allSubmissions.filter(s => s.formId === selectedFormId) : allSubmissions;
    if (searchTerm) {
      subs = subs.filter(s =>
        Object.values(s.data).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase())) ||
        (allForms.find(f => f.id === s.formId)?.title.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    return subs;
  }, [allSubmissions, selectedFormId, searchTerm, allForms]);
  
  // Determine table headers dynamically from the selected form or from all forms if no form is selected
  const tableHeaders = useMemo(() => {
    if (currentForm) {
      return ["Submitted At", ...currentForm.fields.map(f => f.label), "Actions"];
    }
    // Fallback if no specific form is selected - might be too broad or less useful
    // For now, let's just show basic info if no form is selected.
    return ["Form Title", "Submitted At", "Preview Data", "Actions"];
  }, [currentForm]);


  if (isLoading) {
     return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-6 w-1/2" />
        <div className="flex gap-4 mb-4">
            <Skeleton className="h-10 w-1/4" />
            <Skeleton className="h-10 w-1/2" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Form Submissions</h1>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 w-full sm:w-auto">
          <Select onValueChange={handleFormChange} defaultValue={selectedFormId || "all"}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Select a form to view submissions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Forms</SelectItem>
              {allForms.map(form => (
                <SelectItem key={form.id} value={form.id}>{form.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search submissions..."
            className="pl-8 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" disabled><Filter className="mr-2 h-4 w-4" /> Filter</Button>
        <Button variant="outline" disabled><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>
      
      {filteredSubmissions.length === 0 ? (
         <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-xl font-semibold">No Submissions Yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedFormId && !currentForm 
                ? "Selected form not found." 
                : selectedFormId 
                ? `No submissions found for "${currentForm?.title}".` 
                : "No submissions match your current filters."}
          </p>
          {!selectedFormId && allForms.length === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
                You haven't created any forms yet. <a href="/forms/create" className="text-primary hover:underline">Create one now!</a>
            </p>
          )}
        </div>
      ) : (
      <Card className="shadow-lg">
        <Table>
          <TableCaption>
            {selectedFormId && currentForm ? `Submissions for "${currentForm.title}".` : "A list of all form submissions."}
          </TableCaption>
          <TableHeader>
            <TableRow>
              {tableHeaders.map(header => <TableHead key={header}>{header}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSubmissions.map(submission => {
                const formForSubmission = allForms.find(f => f.id === submission.formId);
                return (
                <TableRow key={submission.id}>
                  {currentForm ? (
                    <>
                      <TableCell>{format(new Date(submission.submittedAt), "PPpp")}</TableCell>
                      {currentForm.fields.map(fieldDef => (
                        <TableCell key={fieldDef.id} className="max-w-[200px] truncate">
                          {String(submission.data[fieldDef.name] ?? 'N/A')}
                        </TableCell>
                      ))}
                    </>
                  ) : (
                     <>
                        <TableCell className="font-medium">{formForSubmission?.title || "Unknown Form"}</TableCell>
                        <TableCell>{format(new Date(submission.submittedAt), "PPpp")}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                            {Object.values(submission.data).slice(0,3).join(', ') + (Object.values(submission.data).length > 3 ? '...' : '')}
                        </TableCell>
                     </>
                  )}
                  <TableCell>
                    <Dialog>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DialogTrigger asChild>
                                <DropdownMenuItem onClick={() => setSelectedSubmission(submission)}>
                                    <Eye className="mr-2 h-4 w-4" /> View Details
                                </DropdownMenuItem>
                            </DialogTrigger>
                            <DropdownMenuSeparator />
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                        </DropdownMenuContent>
                        </DropdownMenu>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this submission.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90"
                                onClick={() => handleDeleteSubmission(submission.id)}
                            >
                                Delete
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
                );
            })}
          </TableBody>
        </Table>
      </Card>
      )}
        {selectedSubmission && (
         <Dialog open={!!selectedSubmission} onOpenChange={(isOpen) => !isOpen && setSelectedSubmission(null)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                <DialogTitle>Submission Details</DialogTitle>
                <DialogDescription>
                    Form: {allForms.find(f => f.id === selectedSubmission.formId)?.title || "Unknown Form"} <br />
                    Submitted: {format(new Date(selectedSubmission.submittedAt), "PPpp")}
                </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] my-4">
                <div className="space-y-3 pr-4">
                    {allForms.find(f => f.id === selectedSubmission.formId)?.fields.map(fieldDef => (
                    <div key={fieldDef.id} className="grid grid-cols-3 gap-2 items-start">
                        <span className="font-semibold text-sm col-span-1">{fieldDef.label}:</span>
                        <span className="text-sm col-span-2 break-words">{String(selectedSubmission.data[fieldDef.name] ?? 'N/A')}</span>
                    </div>
                    ))}
                     {Object.keys(selectedSubmission.data).filter(key => !allForms.find(f => f.id === selectedSubmission.formId)?.fields.find(fd => fd.name === key)).map(key => (
                        <div key={key} className="grid grid-cols-3 gap-2 items-start">
                            <span className="font-semibold text-sm col-span-1">{key} (Legacy):</span>
                            <Badge variant="outline" className="text-xs w-fit">Legacy Field</Badge>
                            <span className="text-sm col-span-2 break-words">{String(selectedSubmission.data[key] ?? 'N/A')}</span>
                        </div>
                    ))}
                </div>
                </ScrollArea>
            </DialogContent>
         </Dialog>
        )}
    </div>
  );
}
