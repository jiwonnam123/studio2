
"use client";

import type React from 'react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  // DialogClose, // Removed
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExcelUploadTab } from './ExcelUploadTab';
import { DirectEntryTab } from './DirectEntryTab';
import type { UploadedFile } from '@/types/inquiry';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileAccepted = (file: UploadedFile) => {
    setUploadedFile(file);
  };

  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (activeTab === 'excel') {
      if (uploadedFile && uploadedFile.status === 'success') {
        console.log('Submitting Excel file:', uploadedFile.name);
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `File "${uploadedFile.name}" has been submitted.`,
        });
      } else if (uploadedFile && uploadedFile.status === 'error') {
         toast({
          title: "Submission Error",
          description: uploadedFile.errorMessage || "Cannot submit file with errors.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      } else {
        toast({
          title: "No File",
          description: "Please upload and ensure your Excel file is ready before submitting.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      // Placeholder for direct entry submission
      console.log('Submitting direct entry form...');
      toast({
        title: "Inquiry Submitted (Direct)",
        description: "Your direct entry inquiry has been submitted.",
      });
    }
    
    setIsSubmitting(false);
    setUploadedFile(null); // Reset file state
    onOpenChange(false); // Close modal on successful submission
  };
  
  const handleModalClose = (isOpen: boolean) => {
    if (!isOpen) {
       setUploadedFile(null); // Reset file state when modal is closed
       setActiveTab('excel'); // Reset to default tab
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[572px] flex flex-col">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="flex-grow flex flex-col overflow-hidden px-6 pt-2 pb-0">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="direct">Direct Entry</TabsTrigger>
          </TabsList>
          
          <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
            <TabsContent value="excel" className="mt-0">
              <ExcelUploadTab onFileAccepted={handleFileAccepted} />
            </TabsContent>
            <TabsContent value="direct" className="mt-0">
              <DirectEntryTab />
            </TabsContent>
          </div>
        </Tabs>
        
        <DialogFooter className="p-6 border-t bg-muted/30 flex-shrink-0 flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-0">
          {/* Removed DialogClose and Cancel Button */}
          <Button onClick={handleSubmitInquiry} className="w-full sm:w-auto" disabled={isSubmitting || (activeTab === 'excel' && (!uploadedFile || uploadedFile.status !== 'success'))}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Inquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
