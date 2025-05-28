
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
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds for worker timeout
const LARGE_FILE_WARNING_THRESHOLD_MB = 5; // 5MB for warning toast

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // For main submit button
  const [isProcessing, setIsProcessing] = useState(false); // For Excel worker processing

  const workerRef = useRef<Worker | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearProcessingTimeout = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);
  
  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      // console.log("Terminating worker explicitly");
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    // This function now directly receives WorkerParseResponse
    // and updates excelValidationState (which is ExcelValidationResult type)
    setExcelValidationState(prevResult => {
      const newValidationResult: ExcelValidationResult = {
        error: result.error,
        hasData: result.dataExistsInSheet, // Use dataExistsInSheet from worker
        totalDataRows: result.totalDataRows,
        previewData: result.previewData,
        fileSize: result.fileSize,
        processingTime: result.processingTime,
        isLargeFile: result.isLargeFile,
        headersValid: result.headersValid,
      };

      if (JSON.stringify(prevResult) === JSON.stringify(newValidationResult)) {
        return prevResult;
      }
      
      // Show toasts based on the new result
      if (newValidationResult.isLargeFile && !newValidationResult.error && newValidationResult.hasData) {
        toast({
          title: "대용량 파일 처리 완료",
          description: `${newValidationResult.fileSize ? (newValidationResult.fileSize / 1024 / 1024).toFixed(1) : 'Large'}MB 파일 (${newValidationResult.totalDataRows || 0} 행) 처리가 완료되었습니다.`,
        });
      } else if (!newValidationResult.error && newValidationResult.hasData) {
         toast({
          title: "File Valid & Ready",
          description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
        });
      }
      return newValidationResult;
    });
  }, [toast]); 

  const initializeAndRunWorker = useCallback((file: File) => {
    terminateWorker(); 
    clearProcessingTimeout();

    const newWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = newWorker;

    newWorker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      if (workerRef.current !== newWorker) {
        // console.log("Stale worker message, ignoring.");
        newWorker.terminate(); // Terminate the sender if it's not the current one
        return;
      }
      // console.log("InquiryModal: Worker message received", event.data);
      clearProcessingTimeout();
      setIsProcessing(false);
      handleExcelValidationComplete(event.data);
      
      if (event.data.processingTime && event.data.fileSize) {
        console.log(`Excel 처리 완료:`, {
          파일크기: `${(event.data.fileSize / 1024).toFixed(1)}KB`,
          처리시간: `${event.data.processingTime.toFixed(1)}ms`,
          행수: event.data.totalDataRows,
          헤더유효: event.data.headersValid,
          데이터존재: event.data.dataExistsInSheet,
        });
      }
      terminateWorker(); 
    };

    newWorker.onerror = (err) => {
      if (workerRef.current !== newWorker) {
        // console.log("Stale worker error, ignoring.");
        newWorker.terminate();
        return;
      }
      console.error("InquiryModal: Worker error:", err);
      clearProcessingTimeout();
      setIsProcessing(false);
      handleExcelValidationComplete({ // Pass a WorkerParseResponse-like object
        error: `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`,
        previewData: null,
        totalDataRows: 0,
        headersValid: false,
        dataExistsInSheet: false,
        fileSize: file.size, // Include fileSize even on error
        isLargeFile: file.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024),
        // processingTime might not be accurate here, but we can set it to 0 or undefined
      });
      terminateWorker(); 
    };

    processingTimeoutRef.current = setTimeout(() => {
      if (workerRef.current !== newWorker) return; 
      // console.warn("InquiryModal: Worker processing timed out.");
      setIsProcessing(false);
      handleExcelValidationComplete({ // Pass a WorkerParseResponse-like object
        error: 'File parsing timed out. The file might be too large or complex.',
        previewData: null,
        totalDataRows: 0,
        headersValid: false,
        dataExistsInSheet: false,
        fileSize: file.size,
        isLargeFile: file.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024),
      });
      terminateWorker();
    }, PROCESSING_TIMEOUT_MS);

    newWorker.postMessage({ file });

  }, [terminateWorker, clearProcessingTimeout, handleExcelValidationComplete]);

  const processFileWithWorker = useCallback((file: File) => {
    setIsProcessing(true);
    setExcelValidationState(null); 

    if (file.size > LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024) { 
      toast({
        title: "대용량 파일 처리 중",
        description: `파일 크기가 ${(file.size / 1024 / 1024).toFixed(1)}MB 입니다. 처리에 다소 시간이 걸릴 수 있습니다.`,
        variant: "default", 
        duration: 5000,
      });
    }
    initializeAndRunWorker(file);
  }, [initializeAndRunWorker, toast]);

  const handleFileChange = useCallback((newUploadedFile: UploadedFile | null) => {
    setUploadedFile(newUploadedFile); // Update the state for FileUploadZone
    
    if (!newUploadedFile || newUploadedFile.status !== 'success') {
      setExcelValidationState(null); 
      setIsProcessing(false);      
      terminateWorker();
      clearProcessingTimeout();
    } else {
      // File is successfully "uploaded" by FileUploadZone, now process it with worker
      processFileWithWorker(newUploadedFile.file);
    }
  }, [processFileWithWorker, terminateWorker, clearProcessingTimeout]);

  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    // Simulate API call or actual submission logic
    await new Promise(resolve => setTimeout(resolve, 1500)); 

    if (activeTab === 'excel') {
      // Validation for submit button relies on excelValidationState
      if (excelValidationState && !excelValidationState.error && excelValidationState.hasData) {
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `File "${uploadedFile?.name}" with ${excelValidationState.totalDataRows || 0} data rows has been submitted.`,
        });
         // Reset state after successful submission
        setUploadedFile(null);
        setExcelValidationState(null);
        setIsProcessing(false);
        terminateWorker();
        clearProcessingTimeout();
        onOpenChange(false);
      } else {
         // This case should ideally be prevented by disabled button, but good for robustness
        let description = "Cannot submit. Please upload a valid Excel file with data.";
        if (uploadedFile && uploadedFile.status === 'error') {
          description = uploadedFile.errorMessage || "Cannot submit: file upload error.";
        } else if (excelValidationState && excelValidationState.error) {
          description = `Cannot submit: ${excelValidationState.error}`;
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
       onOpenChange(false); // Close modal on successful submission
    }
    setIsSubmitting(false);
  };

  const resetAllStates = useCallback(() => {
    setUploadedFile(null);
    setExcelValidationState(null);
    setIsProcessing(false);
    terminateWorker();
    clearProcessingTimeout();
  }, [terminateWorker, clearProcessingTimeout]);

  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      resetAllStates();
    }
    onOpenChange(isOpen);
  }, [onOpenChange, resetAllStates]);
  
  // Cleanup on component unmount
  useEffect(() => {
    return () => {
        terminateWorker();
        clearProcessingTimeout();
    };
  }, [terminateWorker, clearProcessingTimeout]);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true; // Disable if main submitting or worker processing
    if (!uploadedFile || uploadedFile.status !== 'success') return true;
    if (!excelValidationState || excelValidationState.error !== null || !excelValidationState.hasData) return true;
    return false;
  };

  const isDirectEntrySubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true; // Disable if worker processing for excel tab (global isProcessing)
    return false; 
  };

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col">
        <DialogHeader className="p-6 pb-2 text-center sm:text-center"> {/* Reduced pb for tighter spacing */}
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
          {/* Display processing info only if not currently processing AND validation state exists */}
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
                onFileChange={handleFileChange} // Pass the modal's handler
                excelValidationState={excelValidationState}
                isProcessing={isProcessing} // Pass the modal's processing state
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
              isSubmitting || isProcessing || // Global processing check first
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
