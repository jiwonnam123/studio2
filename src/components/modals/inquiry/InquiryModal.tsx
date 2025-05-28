
"use client";

import type React from 'react';
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExcelUploadTab } from './ExcelUploadTab';
import { DirectEntryTab } from './DirectEntryTab';
import type { UploadedFile, ExcelValidationResult } from '@/types/inquiry';
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
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = useCallback((file: UploadedFile | null) => {
    setUploadedFile(file);
    if (!file || file.status !== 'success') {
      // Reset validation state if file is removed or not successful
      if (excelValidationState !== null) { // Prevent unnecessary update if already null
        setExcelValidationState(null);
      }
    }
  }, [excelValidationState]); // excelValidationState added to prevent stale closure issues if it were used directly in setExcelValidationState

  const handleExcelValidationComplete = useCallback((result: ExcelValidationResult) => {
    setExcelValidationState(prevState => {
      // Prevent update if the new result is effectively the same as the old one
      if (JSON.stringify(prevState) === JSON.stringify(result)) {
        return prevState;
      }
      return result;
    });
  }, []);

  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (activeTab === 'excel') {
      if (uploadedFile && uploadedFile.status === 'success' && excelValidationState && excelValidationState.error === null && excelValidationState.hasData) {
        console.log('Submitting Excel file:', uploadedFile.name);
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `File "${uploadedFile.name}" has been submitted.`,
        });
      } else {
        let description = "Please upload a valid Excel file with data.";
        if (uploadedFile && uploadedFile.status === 'error') {
          description = uploadedFile.errorMessage || "Cannot submit file with errors.";
        } else if (excelValidationState && excelValidationState.error) {
          description = excelValidationState.error;
        } else if (excelValidationState && !excelValidationState.hasData) {
          description = "The Excel file is valid but contains no data rows to submit.";
        }
        toast({
          title: "Submission Error",
          description,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      // Placeholder for direct entry submission
      // Access grid data here (needs to be lifted up or accessed via ref)
      console.log('Submitting direct entry form...');
      toast({
        title: "Inquiry Submitted (Direct)",
        description: "Your direct entry inquiry has been submitted.",
      });
    }
    
    setIsSubmitting(false);
    setUploadedFile(null); 
    setExcelValidationState(null);
    onOpenChange(false); 
  };
  
  const handleModalClose = (isOpen: boolean) => {
    if (!isOpen) {
       setUploadedFile(null); 
       setExcelValidationState(null);
       // setActiveTab('excel'); // Resetting tab might not be desired if user reopens
    }
    onOpenChange(isOpen);
  };

  const isExcelSubmitDisabled = () => {
    if (activeTab !== 'excel') return false; // Not disabled if not excel tab (other tab might have own logic)
    if (isSubmitting) return true;
    if (!uploadedFile || uploadedFile.status !== 'success') return true;
    if (!excelValidationState || excelValidationState.error !== null || !excelValidationState.hasData) return true;
    return false;
  };

  // Placeholder for direct entry submit disabled logic
  const isDirectEntrySubmitDisabled = () => {
    if (activeTab !== 'direct') return false;
    if (isSubmitting) return true;
    // Add logic for direct entry validation if needed
    // e.g., check if gridData is empty or invalid
    return false; 
  };


  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col">
        <DialogHeader className="p-6 pb-0 text-center sm:text-center"> 
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
              <ExcelUploadTab 
                uploadedFileState={uploadedFile} 
                onFileChange={handleFileChange}
                onValidationComplete={handleExcelValidationComplete}
              />
            </TabsContent>
            <TabsContent value="direct" className="mt-0 h-full"> {/* Ensure DirectEntryTab can take full height */}
              <DirectEntryTab />
            </TabsContent>
          </div>
        </Tabs>
        
        <DialogFooter className="p-6 border-t bg-muted/30 flex-shrink-0">
          <Button 
            onClick={handleSubmitInquiry} 
            className="w-full sm:w-auto" 
            disabled={
              isSubmitting ||
              (activeTab === 'excel' && isExcelSubmitDisabled()) ||
              (activeTab === 'direct' && isDirectEntrySubmitDisabled())
            }
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Inquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
