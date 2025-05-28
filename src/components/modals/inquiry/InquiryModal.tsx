
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
import { useToast as uiToastHook } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Global processing for worker
  const [isSubmitting, setIsSubmitting] = useState(false); // For final submission to backend

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null); // Renamed from processingTimeoutRef
  const currentFileRef = useRef<File | null>(null);

  const toastHookResult = uiToastHook();
  const toast = useCallback((options: Parameters<typeof toastHookResult.toast>[0]) => {
    if (toastHookResult && typeof toastHookResult.toast === 'function') {
      return toastHookResult.toast(options);
    }
    console.warn("Toast function not available or called too early.", options);
    return { id: '', dismiss: () => {}, update: () => {} };
  }, [toastHookResult]);

  // STEP 2-2 & 2-F (modified)
  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[DEBUG InquiryModal] clearWorkerAndTimeout called.');
    if (workerRef.current) {
      console.log('[DEBUG InquiryModal clearWorkerAndTimeout] Terminating worker:', workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (timeoutRef.current) {
      console.log('[DEBUG InquiryModal clearWorkerAndTimeout] Clearing timeout:', timeoutRef.current);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // setIsProcessing should be managed by the caller or effect that decides processing is done
  }, []);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    console.log("[DEBUG InquiryModal] handleExcelValidationComplete received result:", result);
    
    const newValidationResult: ExcelValidationResult = {
      error: result.error,
      hasData: result.dataExistsInSheet,
      isValid: result.success,
      totalDataRows: result.totalDataRows,
      previewData: result.previewData,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
      headersValid: result.headersValid,
    };
    setExcelValidationState(newValidationResult);

    if (result.success) {
      toast({
        title: "File Valid & Ready",
        description: `The Excel file is valid and contains ${result.totalDataRows || 0} data row(s). Preview below.`,
      });
    } else if (result.isLargeFile && !result.error && result.headersValid && result.dataExistsInSheet) { // Should be covered by result.success
      toast({
        title: "대용량 파일 처리 완료",
        description: `${result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(1) : 'N/A'}MB 파일 (${result.totalDataRows || 0} 행) 처리가 완료되었습니다. 미리보기를 확인하고 제출하세요.`,
      });
    }
    // Error toasts are handled by on_error or if newValidationResult.error is set
  }, [setExcelValidationState, toast]);

  // STEP 3-1 (modified into useCallback)
  const createExcelWorker = useCallback((): Worker | null => {
    console.log('[DEBUG InquiryModal] createExcelWorker called.');
    try {
      if (typeof Worker === 'undefined') {
        console.error('[ERROR InquiryModal] Worker not supported in this environment.');
        throw new Error('Web Workers are not supported in this environment.');
      }
      const newWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[DEBUG InquiryModal] New worker CREATED:', newWorker);
      return newWorker;
    } catch (error) {
      console.error('[ERROR InquiryModal] Worker creation failed:', error);
      setExcelValidationState({
        error: `Failed to initialize file processing: ${error instanceof Error ? error.message : 'Unknown worker error.'}`,
        hasData: false,
        isValid: false,
      });
      setIsProcessing(false); // Ensure processing stops if worker fails to create
      return null;
    }
  }, [setIsProcessing, setExcelValidationState]);


  // STEP 3-2 (modified into useCallback)
  const setupWorkerHandlers = useCallback((worker: Worker, fileForWorker: File) => {
    console.log('[DEBUG InquiryModal] setupWorkerHandlers for worker:', worker);
    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      // Ensure this message is for the current file being processed
      if (currentFileRef.current && fileForWorker.name === currentFileRef.current.name && fileForWorker.size === currentFileRef.current.size) {
        console.log('[DEBUG InquiryModal] Worker ONMESSAGE. Data:', event.data);
        handleExcelValidationComplete(event.data);
      } else {
        console.warn('[DEBUG InquiryModal] Worker ONMESSAGE from STALE worker or for different file, ignored.');
      }
      setIsProcessing(false);
      clearWorkerAndTimeout(); // Clean up after message
    };

    worker.onerror = (err) => {
      if (currentFileRef.current && fileForWorker.name === currentFileRef.current.name && fileForWorker.size === currentFileRef.current.size) {
        console.error('[DEBUG InquiryModal] Worker ONERROR. Error:', err);
        handleExcelValidationComplete({
          success: false,
          error: `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`,
          previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: fileForWorker.size, isLargeFile: fileForWorker.size > (5 * 1024 * 1024),
        });
      } else {
         console.warn('[DEBUG InquiryModal] Worker ONERROR from STALE worker or for different file, ignored.');
      }
      setIsProcessing(false);
      clearWorkerAndTimeout(); // Clean up after error
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout, setIsProcessing]);


  // STEP 1-1 (modified handleFileChange)
  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[DEBUG InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile); // This will trigger the main useEffect
    currentFileRef.current = newFile?.file || null;

    // If file is removed or had an error from FileUploadZone itself
    if (!newFile || newFile.status === 'error') {
      console.log("[DEBUG InquiryModal handleFileChange] File removed or dropzone error. Resetting states.");
      setExcelValidationState(newFile?.status === 'error' ? {
        error: newFile.errorMessage || "Error during file selection.",
        hasData: false, isValid: false, headersValid: false,
      } : null);
      setIsProcessing(false); // Ensure processing stops
      clearWorkerAndTimeout(); // Clean up any existing worker/timeout
    }
  }, [clearWorkerAndTimeout, setIsProcessing, setExcelValidationState]); // Added setIsProcessing, setExcelValidationState


  // STEP 2-1 (Memoized uploadedFile for useEffect dependency)
  const memoizedFileStatus = useMemo(() => uploadedFile?.status, [uploadedFile]);
  const memoizedFileObject = useMemo(() => uploadedFile?.file, [uploadedFile]);


  // STEP 4-1 (Main useEffect for file processing)
  useEffect(() => {
    console.log(`[DEBUG InquiryModal useEffect_Main] TRIGGERED. File status: ${memoizedFileStatus}, isProcessing: ${isProcessing}`);
    
    if (!memoizedFileObject || !memoizedFileStatus) {
      console.log('[DEBUG InquiryModal useEffect_Main] No file or status, ensuring cleanup.');
      // This case is mostly handled by handleFileChange or modal close.
      // If needed, add cleanup here, but be cautious of loops if isProcessing is a dep.
      // For now, rely on handleFileChange for explicit nullification.
      return;
    }

    if (memoizedFileStatus === 'uploading') {
      console.log('[DEBUG InquiryModal useEffect_Main] File status is "uploading". Clearing previous validation, waiting for "success".');
      setExcelValidationState(null); // Clear previous validation results.
      // Do NOT setIsProcessing(true) here, wait for 'success'
      // Do NOT clear worker here yet, might be a rapid re-upload.
      return;
    }

    if (memoizedFileStatus === 'success' && !isProcessing) {
      console.log('[DEBUG InquiryModal useEffect_Main] File status is "success" and not currently processing. Starting worker for:', memoizedFileObject.name);
      
      // Clear any remnants from a previous, possibly interrupted, run for this file
      clearWorkerAndTimeout(); // Clears refs, does not set isProcessing

      setIsProcessing(true);
      setExcelValidationState(null); // Clear previous validation state before new processing

      if (memoizedFileObject.size > 10 * 1024 * 1024 && typeof toast === 'function') { // 10MB
        toast({
          title: "대용량 파일 처리 중",
          description: `파일 크기가 ${(memoizedFileObject.size / 1024 / 1024).toFixed(1)}MB 입니다. 처리에 시간이 걸릴 수 있습니다.`,
          duration: 7000,
        });
      }

      const localWorker = createExcelWorker();
      if (!localWorker) {
        // Error already handled and logged in createExcelWorker, isProcessing set to false
        return; // Exit if worker creation failed
      }
      
      workerRef.current = localWorker; // Assign to ref
      setupWorkerHandlers(localWorker, memoizedFileObject); // Pass current file to handlers for context

      console.log('[DEBUG InquiryModal useEffect_Main] Posting file to worker:', memoizedFileObject);
      localWorker.postMessage({ file: memoizedFileObject });

      // Set processing timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current); // Clear previous one
      timeoutRef.current = setTimeout(() => {
        if (workerRef.current === localWorker) { // Check if it's still the same worker
            console.warn('[DEBUG InquiryModal useEffect_Main] Worker TIMEOUT for worker:', localWorker);
            handleExcelValidationComplete({
              success: false, error: 'File parsing timed out. The file might be too large or complex.',
              previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
              fileSize: memoizedFileObject.size, isLargeFile: memoizedFileObject.size > (5 * 1024 * 1024),
            });
            setIsProcessing(false);
            clearWorkerAndTimeout(); // Also calls setIsProcessing(false) but it's fine
        }
      }, PROCESSING_TIMEOUT_MS);
      console.log('[DEBUG InquiryModal useEffect_Main] Timeout SET for current worker.');

    } else if (memoizedFileStatus === 'success' && isProcessing) {
      console.log('[DEBUG InquiryModal useEffect_Main] File is "success" but already processing. Waiting for current processing to finish.');
    } else if (memoizedFileStatus === 'error') {
        console.log('[DEBUG InquiryModal useEffect_Main] File status is "error" (from FileUploadZone). Displaying error.');
        // Error display is handled by ExcelUploadTab based on uploadedFile.errorMessage
        // and excelValidationState (which was set in handleFileChange).
        // Ensure isProcessing is false if an error occurred at dropzone level.
        if(isProcessing) setIsProcessing(false);
        clearWorkerAndTimeout();
    }

    // This cleanup is crucial for when `memoizedFileStatus` or `memoizedFileObject` changes,
    // or when the component unmounts while a worker is active.
    return () => {
        console.log('[DEBUG InquiryModal useEffect_Main] CLEANUP function called. Current workerRef:', workerRef.current);
        // This specific cleanup might run for the *previous* instance of the effect.
        // clearWorkerAndTimeout is more global.
        // It's safer to rely on the clearing logic at the start of 'success' block for active workers.
        // However, for unmount, this is important.
        if (workerRef.current) { // If a worker was started by this effect run and is still in ref
             // clearWorkerAndTimeout(); // This might be too broad here, leading to double-clearing
        }
    };
  // Dependencies based on guide + what's used inside and should trigger re-evaluation
  }, [memoizedFileStatus, memoizedFileObject, isProcessing, createExcelWorker, setupWorkerHandlers, clearWorkerAndTimeout, handleExcelValidationComplete, toast, setIsProcessing, setExcelValidationState]);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[DEBUG InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (!isOpen) {
      console.log("[DEBUG InquiryModal] Modal closing. Resetting states and cleaning up.");
      setUploadedFile(null); // This will trigger the main useEffect to clean up
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      setIsProcessing(false); // Explicitly set processing to false
      clearWorkerAndTimeout(); // Final cleanup
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout, setIsProcessing, setExcelValidationState]);


  // STEP 2-F (Component unmount cleanup)
  useEffect(() => {
    console.log('[DEBUG InquiryModal] Component MOUNTED.');
    return () => {
      console.log("[DEBUG InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
      setIsProcessing(false); // Ensure processing is false on unmount
    };
  }, [clearWorkerAndTimeout, setIsProcessing]); // Added setIsProcessing

  // STEP 5-1 (State change logging)
  useEffect(() => {
    console.log('[DEBUG InquiryModal State changed]:', {
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
    // STEP 2-E
    if (isSubmitting || isProcessing) return true;
    if (!uploadedFile || uploadedFile.status !== 'success') return true;
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData) return true; // Use isValid and hasData
    return false;
  };

  const isDirectEntrySubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    return false;
  };

  const handleSubmitInquiry = async () => {
    // ... (submission logic remains largely the same, ensure to use isProcessing state)
    setIsSubmitting(true);
    console.log(`[DEBUG InquiryModal] handleSubmitInquiry called for tab: ${activeTab}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000)); 

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData) {
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `File "${uploadedFile?.name}" with ${excelValidationState.totalDataRows || 0} data rows submitted.`,
        });
        handleModalOpenChange(false);
      } else {
        toast({ title: "Submission Error (Excel)", description: excelValidationState?.error || "Invalid data.", variant: "destructive" });
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
  
  // STEP 5-2 (Component rendering logging)
  console.log('[DEBUG InquiryModal] Component rendering:', {
    renderTime: new Date().toISOString(),
    isProcessing,
    fileStatus: uploadedFile?.status,
    excelError: excelValidationState?.error,
    excelHasData: excelValidationState?.hasData,
    excelIsValid: excelValidationState?.isValid,
  });

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col">
        <DialogHeader className="p-6 pb-2 text-center">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
          {/* STEP 2-D (UI state display) */}
          {isProcessing && activeTab === 'excel' && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중입니다. 잠시만 기다려 주세요...
            </div>
          )}
          {!isProcessing && excelValidationState && activeTab === 'excel' && (
            <div className="text-xs text-muted-foreground pt-2 space-y-0.5 text-center">
              {excelValidationState.fileSize !== undefined && (
                <p>파일 크기: {(excelValidationState.fileSize / 1024).toFixed(1)}KB</p>
              )}
              {excelValidationState.processingTime !== undefined && (
                <p>처리 시간: {excelValidationState.processingTime.toFixed(0)}ms</p>
              )}
              {excelValidationState.totalDataRows !== undefined && (
                <p>총 데이터 행: {excelValidationState.totalDataRows}</p>
              )}
               {excelValidationState.error && <p className="text-destructive">오류: {excelValidationState.error}</p>}
            </div>
          )}
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="flex-grow flex flex-col overflow-hidden px-6 pt-2 pb-0">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="excel" disabled={isSubmitting || (isProcessing && activeTab === 'excel') }>Excel Upload</TabsTrigger>
            <TabsTrigger value="direct" disabled={isSubmitting || (isProcessing && activeTab === 'excel') }>Direct Entry</TabsTrigger>
          </TabsList>

          <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
            <TabsContent value="excel" className="mt-0">
              <ExcelUploadTab
                uploadedFileState={uploadedFile}
                onFileChange={handleFileChange} // This is InquiryModal's handleFileChange
                excelValidationState={excelValidationState}
                isProcessingGlobal={isProcessing} // Pass global processing state
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
              isSubmitting || isProcessing || // Global disable if processing
              (activeTab === 'excel' && isExcelSubmitDisabled()) ||
              (activeTab === 'direct' && isDirectEntrySubmitDisabled())
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
