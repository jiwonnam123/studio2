
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
import type { UploadedFile, ExcelValidationResult, WorkerParseRequest, WorkerParseResponse } from '@/types/inquiry';
import { useToast as uiToastHook } from '@/hooks/use-toast'; // Renamed to avoid conflict
import { Loader2 } from 'lucide-react';

const PROCESSING_TIMEOUT_MS = 5000; // 5초로 단축
const LARGE_FILE_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB
const EXTRA_LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB for toast warning

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null); // To track the file being processed by the current worker

  const toastHookResult = uiToastHook();
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

  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[InquiryModal] clearWorkerAndTimeout called.');
    if (workerRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Terminating workerRef.current:', workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (timeoutRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Clearing timeoutRef.current:', timeoutRef.current);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // This function should not set isProcessing to false directly here.
    // The caller (onmessage, onerror, timeout, or main useEffect cleanup) should manage isProcessing.
  }, []);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success || false,
      error: result.error || null,
      hasData: result.dataExistsInSheet || false,
      previewData: result.previewData || null,
      fullData: result.fullData || null,
      totalDataRows: result.totalDataRows || 0,
      headersValid: result.headersValid || false,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
    };
    console.log("[InquiryModal] handleExcelValidationComplete received result:", newValidationResult);
    
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
    console.log('[InquiryModal createExcelWorker] Attempting to create worker.');
    try {
      if (typeof Worker === 'undefined') {
        console.error('[ERROR InquiryModal createExcelWorker] Worker not supported in this environment.');
        // Optionally inform the user via excelValidationState
        setExcelValidationState({
          isValid: false, error: 'Web Workers are not supported in your browser. Excel processing may be slow or unavailable.',
          hasData: false,
        });
        return null;
      }
      // Ensure the path is correct for your build setup.
      // For Next.js, this often means placing the worker file in the `public` directory
      // and referencing it as `/excelParser.worker.js` or using `new URL(...)`.
      // Using new URL is generally more robust with modern bundlers.
      const worker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[InquiryModal createExcelWorker] Worker CREATED successfully.');
      return worker;
    } catch (error) {
      console.error('[ERROR InquiryModal createExcelWorker] Worker creation failed:', error);
      setExcelValidationState({
          isValid: false, error: 'Excel processing environment could not be initialized.',
          hasData: false,
      });
      return null;
    }
  }, []);

  const setupWorkerHandlers = useCallback((worker: Worker, associatedFile: File) => {
    console.log('[InquiryModal setupWorkerHandlers] Setting up handlers for worker and file:', associatedFile.name);

    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      // Check if this message is from the current worker and for the current file
      if (workerRef.current === worker && currentFileRef.current?.name === associatedFile.name) {
        console.log('[InquiryModal handleWorkerMessage] Worker ONMESSAGE. Current worker:', workerRef.current, 'Message for file:', associatedFile.name, 'Data:', event.data);
        
        if (event.data.type === 'progress') {
          console.log(`[InquiryModal handleWorkerMessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
          // Optionally, update some state to show progress in UI, e.g., setProgressState(event.data);
          return; 
        }

        // It's a result message
        handleExcelValidationComplete(event.data);
        setIsProcessing(false);
        clearWorkerAndTimeout(); // Clear after processing the message
      } else {
         console.warn('[InquiryModal handleWorkerMessage] Received message from STALE worker/file. IGNORED. Current file:', currentFileRef.current?.name, 'Message for:', associatedFile.name, 'Worker was:', worker);
      }
    };

    worker.onerror = (errorEvent) => {
       if (workerRef.current === worker && currentFileRef.current?.name === associatedFile.name) {
        console.error('[InquiryModal handleWorkerError] Worker ONERROR. Current worker:', workerRef.current, 'Error for file:', associatedFile.name, 'ErrorEvent:', errorEvent);
        handleExcelValidationComplete({
          type: 'result', success: false, error: `Worker error: ${errorEvent.message || 'Unknown worker error.'}`,
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: associatedFile.size, isLargeFile: associatedFile.size > LARGE_FILE_THRESHOLD_BYTES
        });
        setIsProcessing(false);
        clearWorkerAndTimeout();
      } else {
        console.warn('[InquiryModal handleWorkerError] Received error from STALE worker/file. IGNORED.');
      }
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);


  // Main effect for handling file uploads and starting worker
  useEffect(() => {
    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}, workerRef.current: ${!!workerRef.current}`);
    
    const currentFileObject = uploadedFile?.file;

    if (uploadedFile && currentFileObject && uploadedFile.status === 'success') {
      if (isProcessing || workerRef.current) {
        console.log("[InquiryModal useEffect_uploadedFile] Already processing or worker exists. Aborting new worker start for:", currentFileObject.name);
        return; // Prevent starting a new worker if one is already active or processing
      }

      console.log("[InquiryModal useEffect_uploadedFile] Entered SUCCESS block for file:", currentFileObject.name);
      
      currentFileRef.current = currentFileObject; // Set the file being processed
      
      // Clean up any potentially lingering previous worker/timeout before starting new
      // This is a safety net, clearWorkerAndTimeout should manage refs properly.
      if (workerRef.current) {
        console.warn("[InquiryModal useEffect_uploadedFile] Lingering workerRef found before new start. Terminating.", workerRef.current);
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        console.warn("[InquiryModal useEffect_uploadedFile] Lingering timeoutRef found before new start. Clearing.", timeoutRef.current);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setExcelValidationState(null); // Reset previous validation
      setIsProcessing(true);
      console.log("[InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE.");

      if (currentFileObject.size > EXTRA_LARGE_FILE_THRESHOLD_BYTES) { // 10MB
        toast({
            title: "Processing Very Large File",
            description: `The uploaded Excel file (${(currentFileObject.size / (1024*1024)).toFixed(1)}MB) is very large and may take some time to process. Please wait.`,
            duration: 10000,
        });
      }
      
      const localWorker = createExcelWorker();

      if (!localWorker) {
        console.error("[InquiryModal useEffect_uploadedFile] Failed to create worker instance.");
        handleExcelValidationComplete({
            type: 'result', success: false, error: 'Excel processing environment could not be initialized.',
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: currentFileObject.size, isLargeFile: currentFileObject.size > LARGE_FILE_THRESHOLD_BYTES,
        });
        setIsProcessing(false);
        currentFileRef.current = null;
        return;
      }
      
      console.log("[InquiryModal useEffect_uploadedFile] New worker CREATED:", localWorker);
      workerRef.current = localWorker; // Assign to ref *after* successful creation
      setupWorkerHandlers(localWorker, currentFileObject);
      
      console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker with file:', currentFileObject.name);
      localWorker.postMessage({ file: currentFileObject } as WorkerParseRequest);

      const localTimeoutId = setTimeout(() => {
        if (workerRef.current === localWorker && currentFileRef.current?.name === currentFileObject.name) { 
            console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for worker:', localWorker, 'File:', currentFileObject.name);
            handleExcelValidationComplete({
                type: 'result', success: false, error: `Excel file processing timed out (${PROCESSING_TIMEOUT_MS / 1000} seconds).`,
                previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                fileSize: currentFileObject.size, isLargeFile: currentFileObject.size > LARGE_FILE_THRESHOLD_BYTES
            });
            setIsProcessing(false);
            clearWorkerAndTimeout();
        } else {
            console.log('[InquiryModal useEffect_uploadedFile] Timeout for STALE worker/file. IGNORED. Current worker:', workerRef.current, 'Timeout for:', localWorker);
        }
      }, PROCESSING_TIMEOUT_MS);
      timeoutRef.current = localTimeoutId;
      
      // This effect's cleanup function
      return () => {
        console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for SUCCESS block. Current file: ${currentFileObject.name}. Terminating localWorker:`, localWorker, "Clearing localTimeoutId:", localTimeoutId);
        if (localWorker && workerRef.current === localWorker) { // Only terminate if it's the one we started
            localWorker.terminate();
            workerRef.current = null;
        }
        if (localTimeoutId && timeoutRef.current === localTimeoutId) { // Only clear if it's the one we started
            clearTimeout(localTimeoutId);
            timeoutRef.current = null;
        }
        currentFileRef.current = null; 
        // Do not set isProcessing to false here, it's handled by onmessage/onerror/timeout
      };

    } else if (uploadedFile && (uploadedFile.status === 'uploading')) {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for 'success'. Previous validation state cleared.`);
      setExcelValidationState(null); // Clear previous validation while "uploading"
      // Do not start worker or set isProcessing to true yet.
    } else if (uploadedFile && uploadedFile.status === 'error') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "error" from dropzone. Error:`, uploadedFile.errorMessage);
      setExcelValidationState({
        isValid: false, error: uploadedFile.errorMessage || "Error during file selection.", hasData: false,
        fileSize: uploadedFile.size, isLargeFile: uploadedFile.size > LARGE_FILE_THRESHOLD_BYTES
      });
      setIsProcessing(false);
      clearWorkerAndTimeout(); // Ensure any previous worker is cleaned up
    } else if (!uploadedFile) { // File removed or initial state
      console.log('[InquiryModal useEffect_uploadedFile] No file or file removed. Cleaning up states.');
      setExcelValidationState(null);
      setIsProcessing(false);
      clearWorkerAndTimeout();
      currentFileRef.current = null;
    }
  }, [uploadedFile, createExcelWorker, setupWorkerHandlers, clearWorkerAndTimeout, handleExcelValidationComplete, toast]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile);
    // If file is removed or has an initial error from dropzone, reset states immediately.
    // The useEffect above will handle more detailed cleanup based on newFile state.
    if (!newFile || newFile.status === 'error') {
        console.log("[InquiryModal handleFileChange] File removed or dropzone error. Setting excelValidationState to null and isProcessing to false.");
        setExcelValidationState(null);
        setIsProcessing(false); 
        // clearWorkerAndTimeout(); // useEffect will handle this. Avoid direct call here if useEffect depends on uploadedFile.
    }
  }, []);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}.`);
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); 
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      setIsProcessing(false); // Ensure processing is stopped
      clearWorkerAndTimeout();
      currentFileRef.current = null;
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout]);

  // Final cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log("[InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
    };
  }, [clearWorkerAndTimeout]);


  const handleSubmitInquiry = useCallback(async () => {
    console.log("[InquiryModal handleSubmitInquiry] Clicked.");
    console.log("Current Tab:", activeTab);
    console.log("Uploaded File (state):", uploadedFile);
    console.log("Excel Validation State:", excelValidationState);

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        setIsSubmitting(true);
        console.log("Submitting Excel Data. Rows:", excelValidationState.fullData.length, "First 2 rows:", excelValidationState.fullData.slice(0,2));
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `Successfully submitted ${excelValidationState.totalDataRows || excelValidationState.fullData.length} rows from Excel.`,
        });
        setIsSubmitting(false);
        handleModalOpenChange(false);
      } else {
        toast({
          title: "Cannot Submit",
          description: excelValidationState?.error || "Please upload a valid Excel file with data.",
          variant: "destructive",
        });
      }
    } else if (activeTab === 'direct') {
      setIsSubmitting(true);
      console.log("Submitting Direct Entry Data (Not Implemented)");
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: "Inquiry Submitted (Direct Entry)",
        description: "Direct entry data submitted (simulated).",
      });
      setIsSubmitting(false);
      handleModalOpenChange(false);
    }
  }, [activeTab, uploadedFile, excelValidationState, handleModalOpenChange, toast]);
  
  useEffect(() => {
    console.log('[InquiryModal State changed for render]:', {
      timestamp: new Date().toISOString(),
      isProcessing,
      uploadedFileStatus: uploadedFile?.status,
      excelError: excelValidationState?.error,
      excelHasData: excelValidationState?.hasData,
      excelIsValid: excelValidationState?.isValid,
      workerExists: !!workerRef.current,
      timeoutExists: !!timeoutRef.current
    });
  }, [isProcessing, uploadedFile, excelValidationState]);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData) {
      return true;
    }
    return false;
  };

  const isDirectSubmitDisabled = () => {
    return isSubmitting || isProcessing; 
  };
  
  console.log("[InquiryModal] Rendering.", {
    isProcessing,
    uploadedFileStatus: uploadedFile?.status,
    excelValidationStateError: excelValidationState?.error,
    excelValidationStateHasData: excelValidationState?.hasData,
    excelValidationStateIsValid: excelValidationState?.isValid,
  });


  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent 
        className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col"
        onInteractOutside={(event) => {
          if (isProcessing) {
            console.log("[InquiryModal DialogContent] onInteractOutside prevented due to isProcessing.");
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
              파일 처리 중입니다. 잠시만 기다려 주세요... 
              (파일 크기: {uploadedFile?.size ? `${(uploadedFile.size / (1024*1024)).toFixed(2)}MB` : 'N/A'})
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
                onFileChange={handleFileChange}
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
