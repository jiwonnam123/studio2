
"use client";

import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
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
      // Clear previous validation state if file is removed or upload wasn't successful
      if (excelValidationState !== null) { 
         setExcelValidationState(null); 
      }
    }
  }, [excelValidationState]); // excelValidationState is a dependency for the clearing logic

  const handleExcelValidationComplete = useCallback((result: ExcelValidationResult) => {
    // Avoid unnecessary re-renders if the result is the same
    if (JSON.stringify(excelValidationState) === JSON.stringify(result)) {
      return;
    }
    setExcelValidationState(result);

    if (result.error === null && result.hasData && result.totalDataRows && result.totalDataRows > 0) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${result.totalDataRows} data row(s). Preview below. All rows will be processed upon submission.`,
      });
    }
  }, [excelValidationState]);


  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call

    if (activeTab === 'excel') {
      if (uploadedFile && uploadedFile.status === 'success' && excelValidationState && excelValidationState.error === null && excelValidationState.hasData) {
        console.log('Submitting Excel file:', uploadedFile.name, 'with', excelValidationState.totalDataRows, 'rows.');
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `File "${uploadedFile.name}" with ${excelValidationState.totalDataRows} data rows has been submitted.`,
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
      // TODO: Implement direct entry submission logic
      console.log('Submitting direct entry form...');
      // Placeholder for actual submission logic, e.g., get gridData from DirectEntryTab if needed
      toast({
        title: "Inquiry Submitted (Direct)",
        description: "Your direct entry inquiry has been submitted.",
      });
    }

    setIsSubmitting(false);
    setUploadedFile(null);
    setExcelValidationState(null);
    onOpenChange(false); // Close modal on successful submission
  };

  const handleModalOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
       // Clear states when modal is closed
       setUploadedFile(null);
       setExcelValidationState(null);
       // setActiveTab('excel'); // Optionally reset tab to default
    }
    onOpenChange(isOpen);
  };
  
  // Effect to clear states if 'open' prop changes to false externally
  useEffect(() => {
    if (!open) {
      setUploadedFile(null);
      setExcelValidationState(null);
      // Optionally reset activeTab if needed:
      // setActiveTab('excel');
    }
  }, [open]);


  const isExcelSubmitDisabled = () => {
    if (isSubmitting) return true;
    if (!uploadedFile || uploadedFile.status !== 'success') return true;
    if (!excelValidationState || excelValidationState.error !== null || !excelValidationState.hasData) return true;
    return false;
  };

  const isDirectEntrySubmitDisabled = () => {
    // TODO: Implement actual validation for direct entry if needed
    if (isSubmitting) return true;
    // Example: return gridData.length === 0;
    return false; // For now, always enabled if not submitting
  };


  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
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
                excelValidationState={excelValidationState}
              />
            </TabsContent>
            <TabsContent value="direct" className="mt-0 h-full">
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
