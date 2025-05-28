
"use client";

import type React from 'react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds
const LARGE_FILE_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Global processing state for worker
  const [isSubmitting, setIsSubmitting] = useState(false); // For final submission loading state

  const toastHookResult = useToast();
  const toast = useMemo(() => {
    if (toastHookResult && typeof toastHookResult.toast === 'function') {
      return toastHookResult.toast;
    }
    console.warn("[InquiryModal] Toast function not available from useToast. Using dummy.");
    return (options: any) => {
      console.log("DUMMY TOAST (hook disabled or not ready):", options);
      return { id: '', dismiss: () => {}, update: () => {} };
    };
  }, [toastHookResult]);


  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null); // To ensure worker messages correspond to current file

  // Memoize uploadedFile properties that trigger useEffect
  const memoizedUploadedFile = useMemo(() => {
    if (!uploadedFile) return null;
    return {
      file: uploadedFile.file,
      name: uploadedFile.name,
      size: uploadedFile.size,
      status: uploadedFile.status,
      errorMessage: uploadedFile.errorMessage,
    };
  }, [uploadedFile]);


  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[DEBUG InquiryModal clearWorkerAndTimeout] Clearing worker and timeout. Current workerRef:', workerRef.current, 'Current timeoutRef:', timeoutRef.current);
    if (workerRef.current) {
      console.log('[DEBUG InquiryModal clearWorkerAndTimeout] Terminating workerRef.current');
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (timeoutRef.current) {
      console.log('[DEBUG InquiryModal clearWorkerAndTimeout] Clearing timeoutRef.current');
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // setIsProcessing(false); // This should be set by the calling context or after this function
  }, []);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success || false,
      error: result.error || null,
      hasData: result.dataExistsInSheet || false, // Mapped from dataExistsInSheet
      previewData: result.previewData || null,
      fullData: result.fullData || null,
      totalDataRows: result.totalDataRows || 0,
      headersValid: result.headersValid || false,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
    };
    console.log("[DEBUG InquiryModal handleExcelValidationComplete] Received result from worker:", newValidationResult);
    setExcelValidationState(newValidationResult);

    if (newValidationResult.isValid && newValidationResult.hasData) {
       toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview available.`,
      });
    } else if (newValidationResult.error) {
      toast({
        title: "File Processing Issue",
        description: newValidationResult.error || "An error occurred during file processing.",
        variant: "destructive",
      });
    } else if (newValidationResult.isLargeFile && newValidationResult.isValid && !newValidationResult.error) {
        toast({
            title: "Large File Processed",
            description: `Successfully processed a large file (${newValidationResult.fileSize ? (newValidationResult.fileSize / 1024 / 1024).toFixed(1) : 'N/A'}MB).`,
            variant: "default",
            duration: 5000,
        });
    }
  }, [toast]);

  const createExcelWorker = useCallback((): Worker | null => {
    console.log('[DEBUG InquiryModal createExcelWorker] Attempting to create worker.');
    try {
      if (typeof Worker === 'undefined') {
        console.error('[ERROR InquiryModal createExcelWorker] Worker not supported in this environment.');
        throw new Error('Web Workers are not supported in this environment.');
      }
      const worker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[DEBUG InquiryModal createExcelWorker] Worker created successfully.');
      return worker;
    } catch (error) {
      console.error('[ERROR InquiryModal createExcelWorker] Worker creation failed:', error);
      return null;
    }
  }, []);

  const setupWorkerHandlers = useCallback((worker: Worker, fileBeingProcessed: File) => {
    console.log('[DEBUG InquiryModal setupWorkerHandlers] Setting up handlers for worker and file:', fileBeingProcessed.name);
    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      console.log('[DEBUG InquiryModal worker.onmessage] Message received from worker for file:', fileBeingProcessed.name, 'Data:', event.data);
      if (currentFileRef.current?.name === fileBeingProcessed.name) {
        handleExcelValidationComplete(event.data);
        setIsProcessing(false);
        clearWorkerAndTimeout();
      } else {
         console.warn('[WARN InquiryModal worker.onmessage] Received message from STALE worker/file. IGNORED. Current file:', currentFileRef.current?.name, 'Msg for:', fileBeingProcessed.name);
      }
    };

    worker.onerror = (errorEvent) => {
      console.error('[ERROR InquiryModal worker.onerror] Error from worker for file:', fileBeingProcessed.name, 'ErrorEvent:', errorEvent);
       if (currentFileRef.current?.name === fileBeingProcessed.name) {
        handleExcelValidationComplete({
          success: false,
          error: `Worker error: ${errorEvent.message || 'Unknown worker error.'}`,
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: fileBeingProcessed.size, isLargeFile: fileBeingProcessed.size > LARGE_FILE_THRESHOLD_BYTES
        });
        setIsProcessing(false);
        clearWorkerAndTimeout();
      } else {
        console.warn('[WARN InquiryModal worker.onerror] Received error from STALE worker/file. IGNORED.');
      }
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);


  useEffect(() => {
    console.log('[DEBUG InquiryModal useEffect_uploadedFile] TRIGGERED. Memoized uploadedFile:', memoizedUploadedFile, 'isProcessing:', isProcessing);
    
    if (!memoizedUploadedFile || !memoizedUploadedFile.file) {
      console.log('[DEBUG InquiryModal useEffect_uploadedFile] No file or file object missing. Clearing states.');
      setExcelValidationState(null);
      setIsProcessing(false);
      clearWorkerAndTimeout(); // Ensure cleanup if file is removed
      currentFileRef.current = null;
      return;
    }

    const currentFileObject = memoizedUploadedFile.file;

    if (memoizedUploadedFile.status === 'success' && !isProcessing && !workerRef.current) {
      console.log(`[DEBUG InquiryModal useEffect_uploadedFile] Condition MET: File status 'success', not processing, no active worker. Starting worker for: ${currentFileObject.name}.`);
      
      clearWorkerAndTimeout(); // Clear any previous worker before starting a new one
      
      setIsProcessing(true);
      setExcelValidationState(null); // Reset previous validation
      currentFileRef.current = currentFileObject;

      if (currentFileObject.size > LARGE_FILE_THRESHOLD_BYTES) {
        toast({
            title: "Processing Large File",
            description: "The uploaded Excel file is large and may take some time to process. Please wait.",
            duration: 7000, // Increased duration
        });
      }
      
      const newWorker = createExcelWorker();

      if (!newWorker) {
        console.error("[ERROR InquiryModal useEffect_uploadedFile] Failed to create worker instance.");
        handleExcelValidationComplete({
            success: false, error: 'Excel processing environment could not be initialized.',
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: currentFileObject.size, isLargeFile: currentFileObject.size > LARGE_FILE_THRESHOLD_BYTES,
        });
        setIsProcessing(false);
        currentFileRef.current = null; // Reset current file ref
        return;
      }
      
      workerRef.current = newWorker;
      setupWorkerHandlers(newWorker, currentFileObject);
      
      console.log('[DEBUG InquiryModal useEffect_uploadedFile] Posting message to worker with file:', currentFileObject.name);
      newWorker.postMessage({ file: currentFileObject });

      timeoutRef.current = setTimeout(() => {
        console.warn('[WARN InquiryModal useEffect_uploadedFile] Worker TIMEOUT for file:', currentFileObject.name);
        if (workerRef.current === newWorker && currentFileRef.current?.name === currentFileObject.name) { // Check if it's the same worker and file
            handleExcelValidationComplete({
                success: false, error: 'Excel file processing timed out (30 seconds).',
                previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                fileSize: currentFileObject.size, isLargeFile: currentFileObject.size > LARGE_FILE_THRESHOLD_BYTES
            });
            setIsProcessing(false);
            clearWorkerAndTimeout(); // This will terminate the timed-out worker
        } else {
            console.log('[DEBUG InquiryModal useEffect_uploadedFile] Timeout for STALE worker/file. IGNORED.');
        }
      }, PROCESSING_TIMEOUT_MS);

    } else if (memoizedUploadedFile.status === 'error') {
        console.log('[DEBUG InquiryModal useEffect_uploadedFile] File status is "error" (from dropzone). Error:', memoizedUploadedFile.errorMessage);
        setExcelValidationState({
            isValid: false,
            error: memoizedUploadedFile.errorMessage || "Error during file selection.",
            hasData: false,
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false,
            fileSize: memoizedUploadedFile.size,
            isLargeFile: memoizedUploadedFile.size > LARGE_FILE_THRESHOLD_BYTES
        });
        setIsProcessing(false);
        clearWorkerAndTimeout();
        currentFileRef.current = null;
    } else {
      console.log(`[DEBUG InquiryModal useEffect_uploadedFile] No action taken. Status: ${memoizedUploadedFile.status}, isProcessing: ${isProcessing}, workerExists: ${!!workerRef.current}`);
    }

    return () => {
      console.log('[DEBUG InquiryModal useEffect_uploadedFile] CLEANUP function called for file (if any):', currentFileObject?.name);
      // The main clearWorkerAndTimeout in the effect body handles most cases.
      // This cleanup is an additional safety, especially if dependencies change rapidly.
      // It's important that clearWorkerAndTimeout is idempotent.
      clearWorkerAndTimeout();
    };
  }, [memoizedUploadedFile, isProcessing, createExcelWorker, setupWorkerHandlers, clearWorkerAndTimeout, handleExcelValidationComplete, toast]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[DEBUG InquiryModal handleFileChange] called with newFile:", newFile);
    setUploadedFile(newFile); // This will trigger the useEffect above
    
    // If file is removed or has an initial error from dropzone, reset states immediately.
    if (!newFile || newFile.status === 'error') {
        setExcelValidationState(null);
        setIsProcessing(false);
        clearWorkerAndTimeout();
        currentFileRef.current = null;
    }
  }, [clearWorkerAndTimeout]);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[DEBUG InquiryModal handleModalOpenChange] - Trace for modal close");
    }
    console.log(`[DEBUG InquiryModal handleModalOpenChange] Setting open to ${isOpen}. Current isProcessing: ${isProcessing}`);
    if (!isOpen) {
      console.log("[DEBUG InquiryModal handleModalOpenChange] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); // This will trigger the useEffect to cleanup
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      // setIsProcessing(false); // clearWorkerAndTimeout will handle this
      clearWorkerAndTimeout();
      currentFileRef.current = null;
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout, isProcessing]); // Added isProcessing to dependencies

  // Final cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log("[DEBUG InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
    };
  }, [clearWorkerAndTimeout]);


  const handleSubmitInquiry = useCallback(async () => {
    console.log("[DEBUG InquiryModal handleSubmitInquiry] Clicked.");
    console.log("Current Tab:", activeTab);
    console.log("Uploaded File (in state):", uploadedFile); // Log the state variable
    console.log("Excel Validation State:", excelValidationState);

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        setIsSubmitting(true);
        console.log("Submitting Excel Data (simulated - fullData has ", excelValidationState.fullData.length, " rows). First 2 rows:", excelValidationState.fullData.slice(0,2));
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `Successfully submitted ${excelValidationState.totalDataRows || excelValidationState.fullData.length} rows from Excel.`,
        });
        console.log(`Inquiry Submitted (Excel) - ${excelValidationState.totalDataRows || excelValidationState.fullData.length} rows`);
        setIsSubmitting(false);
        handleModalOpenChange(false); // Close modal on success
      } else {
        toast({
          title: "Cannot Submit",
          description: excelValidationState?.error || "Please upload a valid Excel file with data.",
          variant: "destructive",
        });
        console.error("Cannot Submit Excel:", excelValidationState?.error || "Invalid/No data");
      }
    } else if (activeTab === 'direct') {
      // Placeholder for direct entry submission
      setIsSubmitting(true);
      console.log("Submitting Direct Entry Data (Not Implemented)");
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: "Inquiry Submitted (Direct Entry)",
        description: "Direct entry data submitted (simulated).",
      });
      console.log("Inquiry Submitted (Direct Entry) - simulated");
      setIsSubmitting(false);
      handleModalOpenChange(false);
    }
  }, [activeTab, uploadedFile, excelValidationState, handleModalOpenChange, toast]);
  
  // Log current state for rendering
  useEffect(() => {
    console.log('[DEBUG InquiryModal State changed for render]:', {
      timestamp: new Date().toISOString(),
      isProcessing,
      uploadedFileStatus: uploadedFile?.status,
      excelValidationStateError: excelValidationState?.error,
      excelValidationStateHasData: excelValidationState?.hasData,
      excelValidationStateIsValid: excelValidationState?.isValid,
      workerExists: !!workerRef.current,
      timeoutExists: !!timeoutRef.current
    });
  }, [isProcessing, uploadedFile?.status, excelValidationState]);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData) {
      return true;
    }
    return false;
  };

  const isDirectSubmitDisabled = () => {
    return isSubmitting || isProcessing; // Placeholder for direct entry
  };
  
  const finalRenderLog = {
    isProcessing,
    uploadedFileStatus: uploadedFile?.status,
    excelError: excelValidationState?.error,
    excelHasData: excelValidationState?.hasData,
    excelIsValid: excelValidationState?.isValid,
  };
  console.log("[DEBUG InquiryModal] Final rendering states for ExcelUploadTab:", finalRenderLog);

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent 
        className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col"
        onInteractOutside={(event) => {
          if (isProcessing) {
            console.log("[DEBUG InquiryModal DialogContent] onInteractOutside prevented due to isProcessing.");
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="p-6 pb-2 text-center sm:text-center">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
          {isProcessing && activeTab === 'excel' && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중입니다. 잠시만 기다려 주세요... ({excelValidationState?.fileSize && `${(excelValidationState.fileSize / 1024 / 1024).toFixed(2)}MB`})
            </div>
          )}
           {!isProcessing && excelValidationState && activeTab === 'excel' && (
            <div className="text-xs text-muted-foreground pt-2 space-y-0.5 text-center">
              {excelValidationState.fileSize !== undefined && ( <p>파일 크기: {(excelValidationState.fileSize / 1024).toFixed(1)}KB</p> )}
              {excelValidationState.processingTime !== undefined && ( <p>처리 시간: {excelValidationState.processingTime.toFixed(0)}ms</p> )}
              {excelValidationState.totalDataRows !== undefined && excelValidationState.headersValid && ( <p>총 데이터 행 (헤더 제외): {excelValidationState.totalDataRows}</p> )}
            </div>
          )}
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="flex-grow flex flex-col overflow-hidden px-6 pt-2 pb-0">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="excel" disabled={isSubmitting || isProcessing}>Excel Upload</TabsTrigger>
            <TabsTrigger value="direct" disabled={isSubmitting || isProcessing}>Direct Entry</TabsTrigger>
          </TabsList>

          <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
            <TabsContent value="excel" className="mt-0">
              <ExcelUploadTab
                onFileChange={handleFileChange} // This is InquiryModal's handleFileChange
                isProcessingGlobal={isProcessing} 
                uploadedFileState={uploadedFile}
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
              activeTab === 'excel' ? isExcelSubmitDisabled() : isDirectSubmitDisabled()
            }
          >
            {(isSubmitting || (isProcessing && activeTab === 'excel')) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Inquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
