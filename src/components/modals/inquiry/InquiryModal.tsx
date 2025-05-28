
"use client";

import type React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
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
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse } from '@/types/inquiry';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';
const PROCESSING_TIMEOUT_MS = 30000; 
const LARGE_FILE_WARNING_THRESHOLD_MB = 5; 

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 

  const workerRef = useRef<Worker | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    console.log("InquiryModal: Validation complete. Worker Result:", result);
    const newValidationResult: ExcelValidationResult = {
      error: result.error,
      hasData: result.dataExistsInSheet,
      totalDataRows: result.totalDataRows,
      previewData: result.previewData,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
      headersValid: result.headersValid,
    };
    setExcelValidationState(newValidationResult);

    if (!result.error && result.dataExistsInSheet) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${result.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
      });
    } else if (result.isLargeFile && !result.error && result.dataExistsInSheet) {
        toast({
          title: "대용량 파일 처리 완료",
          description: `${result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(1) : 'Large'}MB 파일 (${result.totalDataRows || 0} 행) 처리가 완료되었습니다.`,
        });
    }
  }, [toast]);

  useEffect(() => {
    let currentWorker: Worker | null = null;
    let currentTimeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      console.log("InquiryModal: useEffect cleanup initiated.");
      if (currentWorker) {
        console.log("InquiryModal: Terminating worker from cleanup:", currentWorker);
        currentWorker.terminate();
        currentWorker = null;
      }
      if (workerRef.current) { // Ensure global ref is also cleared if it matches
         console.log("InquiryModal: Terminating worker from global ref in cleanup:", workerRef.current);
         workerRef.current.terminate();
         workerRef.current = null;
      }
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }
       if (processingTimeoutRef.current) { // Ensure global ref is also cleared
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };

    if (uploadedFile && uploadedFile.status === 'success' && uploadedFile.file) {
      console.log("InquiryModal: useEffect - File ready, initiating worker for:", uploadedFile.name);
      
      cleanup(); // Clean up any previous worker before starting a new one

      setExcelValidationState(null);
      setIsProcessing(true);

      const fileToProcess = uploadedFile.file;

      if (fileToProcess.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024)) {
        toast({ /* ... */ });
      }

      const newWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log("InquiryModal: New worker instance created:", newWorker);
      currentWorker = newWorker;
      workerRef.current = newWorker;

      newWorker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
        if (workerRef.current === newWorker) {
          console.log("InquiryModal: Worker message received:", event.data);
          handleExcelValidationComplete(event.data);
          setIsProcessing(false);
          cleanup(); // Cleanup this worker as its job is done
        } else {
          console.log("InquiryModal: Message from stale worker ignored.");
          event.currentTarget?.terminate?.();
        }
      };

      newWorker.onerror = (err) => {
        if (workerRef.current === newWorker) {
          console.error("InquiryModal: Worker error:", err);
          handleExcelValidationComplete({
            error: `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`,
            previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: fileToProcess.size,
            isLargeFile: fileToProcess.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024),
          });
          setIsProcessing(false);
          cleanup();
        } else {
          console.error("InquiryModal: Error from stale worker ignored.");
           (err.currentTarget as Worker)?.terminate?.();
        }
      };
      
      currentTimeoutId = setTimeout(() => {
        if (workerRef.current === newWorker) {
          console.warn("InquiryModal: Worker processing timed out.");
          handleExcelValidationComplete({
            error: 'File parsing timed out. The file might be too large or complex.',
            previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: fileToProcess.size,
            isLargeFile: fileToProcess.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024),
          });
          setIsProcessing(false);
          cleanup();
        } else {
           console.warn("InquiryModal: Timeout for stale worker ignored.");
        }
      }, PROCESSING_TIMEOUT_MS);
      processingTimeoutRef.current = currentTimeoutId;

      console.log("InquiryModal: Posting message to worker for file:", fileToProcess.name);
      newWorker.postMessage({ file: fileToProcess });

    } else if (!uploadedFile) {
      console.log("InquiryModal: useEffect - No uploaded file or status not 'success'. Cleaning up and resetting state.");
      setExcelValidationState(null);
      setIsProcessing(false);
      cleanup();
    }

    return cleanup; // This cleanup runs when `uploadedFile` or `handleExcelValidationComplete` changes, or on unmount.
  }, [uploadedFile, handleExcelValidationComplete]);


  const handleFileChange = useCallback((newUploadedFile: UploadedFile | null) => {
    console.log("InquiryModal: handleFileChange called with:", newUploadedFile);
    setUploadedFile(newUploadedFile);
    // If file is removed (newUploadedFile is null), the useEffect above will handle state reset.
    // If file status is 'error' from FileUploadZone, ExcelUploadTab will display it.
    // If status is 'uploading', useEffect waits for 'success'.
  }, []);

  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (activeTab === 'excel') {
      if (excelValidationState && !excelValidationState.error && excelValidationState.hasData && excelValidationState.headersValid) {
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `File "${uploadedFile?.name}" with ${excelValidationState.totalDataRows || 0} data rows has been submitted.`,
        });
        handleModalOpenChange(false); 
      } else {
        let description = "Cannot submit. Please upload a valid Excel file with data and valid headers.";
        if (uploadedFile && uploadedFile.status === 'error' && uploadedFile.errorMessage) {
          description = uploadedFile.errorMessage;
        } else if (excelValidationState?.error) {
          description = excelValidationState.error;
        } else if (excelValidationState && !excelValidationState.headersValid){
          description = "Cannot submit: The Excel file headers are invalid. Please use the template.";
        } else if (excelValidationState && !excelValidationState.hasData) {
          description = "Cannot submit: The Excel file is valid but contains no data rows.";
        }
        toast({ title: "Submission Error", description, variant: "destructive" });
      }
    } else if (activeTab === 'direct') {
      console.log('Submitting direct entry form...');
      toast({
        title: "Inquiry Submitted (Direct)",
        description: "Your direct entry inquiry has been submitted.",
      });
      handleModalOpenChange(false); 
    }
    setIsSubmitting(false);
  };

  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      console.log("InquiryModal: Modal closing, resetting all states.");
      setUploadedFile(null); 
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsProcessing(false); 
      setIsSubmitting(false); // Also reset submitting state
      
      if (workerRef.current) {
        console.log("InquiryModal: Terminating worker on modal close.");
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);
  
  useEffect(() => { // Component unmount cleanup
    return () => {
      console.log("InquiryModal: Component unmounting, ensuring final cleanup.");
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, []);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    if (!uploadedFile || uploadedFile.status !== 'success') return true;
    if (!excelValidationState || excelValidationState.error !== null || !excelValidationState.hasData || !excelValidationState.headersValid) return true;
    return false;
  };

  const isDirectEntrySubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    return false; 
  };

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col">
        <DialogHeader className="p-6 pb-2 text-center sm:text-center">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
          {isProcessing && activeTab === 'excel' && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중입니다. 잠시만 기다려 주세요...
            </div>
          )}
          {!isProcessing && excelValidationState && activeTab === 'excel' && (
            <div className="text-xs text-muted-foreground pt-2 space-y-0.5">
              {excelValidationState.fileSize !== undefined && (
                <p>파일 크기: {(excelValidationState.fileSize / 1024).toFixed(1)}KB</p>
              )}
              {excelValidationState.processingTime !== undefined && (
                <p>처리 시간: {excelValidationState.processingTime.toFixed(0)}ms</p>
              )}
              {excelValidationState.totalDataRows !== undefined && (
                <p>총 데이터 행: {excelValidationState.totalDataRows}</p>
              )}
            </div>
          )}
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="flex-grow flex flex-col overflow-hidden px-6 pt-2 pb-0">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="excel" disabled={isProcessing}>Excel Upload</TabsTrigger>
            <TabsTrigger value="direct" disabled={isProcessing}>Direct Entry</TabsTrigger>
          </TabsList>

          <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
            <TabsContent value="excel" className="mt-0">
              <ExcelUploadTab
                uploadedFileState={uploadedFile}
                onFileChange={handleFileChange}
                excelValidationState={excelValidationState}
                isProcessing={isProcessing}
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
              isSubmitting || isProcessing ||
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
