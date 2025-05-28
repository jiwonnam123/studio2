
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
// import { useToast as uiToastHook } from '@/hooks/use-toast'; // Temporarily commented out
import { Loader2 } from 'lucide-react';

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';
const PROCESSING_TIMEOUT_MS = 30000; 
const LARGE_FILE_THRESHOLD_MB = 5; 

const dummyToast = (options: any) => {
  console.log("DUMMY TOAST (original commented out):", options);
  return { id: '', dismiss: () => {}, update: () => {} };
};

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null); 

  // const toastHookResult = uiToastHook();
  // const toast = useCallback((options: Parameters<typeof toastHookResult.toast>[0]) => {
  //   if (toastHookResult && typeof toastHookResult.toast === 'function') {
  //     return toastHookResult.toast(options);
  //   }
  //   console.warn("Toast function not available or called too early. Options:", options);
  //   return { id: '', dismiss: () => {}, update: () => {} };
  // }, [toastHookResult]);
  const toast = dummyToast; // Using dummy toast for now


  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[DEBUG InquiryModal] clearWorkerAndTimeout called. Current workerRef:', workerRef.current, 'Current timeoutRef:', timeoutRef.current);
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
  }, []); // No dependencies, it only works with refs

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    console.log("[DEBUG InquiryModal] handleExcelValidationComplete received result:", result);
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success, error: result.error, hasData: result.dataExistsInSheet,
      previewData: result.previewData, fullData: result.fullData, totalDataRows: result.totalDataRows,
      fileSize: result.fileSize, processingTime: result.processingTime, isLargeFile: result.isLargeFile,
      headersValid: result.headersValid,
    };
    setExcelValidationState(newValidationResult);
    // setIsProcessing(false) is now handled by the worker event handlers or timeout directly.
    
    if (result.success && typeof toast === 'function') {
      toast({
        title: "File Valid & Ready",
        description: `The Excel file is valid and contains ${result.totalDataRows || 0} data row(s). Preview below.`,
      });
    } else if (result.error && typeof toast === 'function') {
       toast({
        title: "File Processing Issue",
        description: result.error || "An error occurred during file processing.",
        variant: "destructive",
      });
    }
  }, [toast]); // Dependencies: toast (which is stable if defined outside or memoized)

  const createExcelWorker = useCallback((): Worker | null => {
    console.log('[DEBUG InquiryModal] createExcelWorker attempt.');
    try {
      if (typeof Worker === 'undefined') { throw new Error('Web Workers are not supported.'); }
      const newWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[DEBUG InquiryModal] New worker CREATED:', newWorker);
      return newWorker;
    } catch (error) {
      console.error('[ERROR InquiryModal] Worker creation failed:', error);
      handleExcelValidationComplete({ // Propagate error
        success: false, error: `Failed to initialize file processor: ${error instanceof Error ? error.message : 'Unknown error.'}.`,
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: 0, isLargeFile: false, 
      });
      setIsProcessing(false); // Ensure processing stops
      return null;
    }
  }, [handleExcelValidationComplete, setIsProcessing]); // Added setIsProcessing

  // Using memoized file properties for useEffect dependency to avoid re-runs on same file object but different instance
  const memoizedFileStatus = useMemo(() => uploadedFile?.status, [uploadedFile]);
  const memoizedFileObject = useMemo(() => uploadedFile?.file, [uploadedFile]); // The actual File object

  // Main effect for handling file processing via worker
  useEffect(() => {
    console.log(`[DEBUG InquiryModal useEffect_Main] TRIGGERED. File status: ${memoizedFileStatus}, File object: ${memoizedFileObject?.name}, isProcessing: ${isProcessing}`);
    
    // This localWorker/timeoutId is for the current execution of this effect.
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (memoizedFileObject && memoizedFileStatus === 'success') {
      if (isProcessing && currentFileRef.current?.name === memoizedFileObject.name && currentFileRef.current?.size === memoizedFileObject.size) {
         console.log('[DEBUG InquiryModal useEffect_Main] File "success" but ALREADY processing this exact file. Ignoring duplicate trigger.');
         return; 
      }
      
      console.log('[DEBUG InquiryModal useEffect_Main] File "success". Starting Excel processing for:', memoizedFileObject.name);
      
      // 1. Clear any PREVIOUS worker/timeout *before* starting new.
      // This uses the refs which point to the worker/timeout from the *previous* effect run or another source.
      clearWorkerAndTimeout(); 
      
      // 2. Set states for new processing run
      setIsProcessing(true);     
      setExcelValidationState(null); 
      currentFileRef.current = memoizedFileObject; 

      localWorkerInstance = createExcelWorker();
      if (!localWorkerInstance) { 
        console.error("[DEBUG InquiryModal useEffect_Main] Worker creation failed in effect. Processing stopped.");
        // createExcelWorker already calls handleExcelValidationComplete and setIsProcessing(false)
        currentFileRef.current = null; 
        return;
      }
      workerRef.current = localWorkerInstance; // Update global ref to current worker

      // Setup handlers for THIS localWorkerInstance
      localWorkerInstance.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
        if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === memoizedFileObject.name) {
          console.log('[DEBUG InquiryModal Worker ONMESSAGE] for file:', memoizedFileObject.name, 'Data:', event.data);
          handleExcelValidationComplete(event.data);
        } else { console.warn('[DEBUG InquiryModal Worker ONMESSAGE] from STALE worker/file. IGNORED.'); }
        setIsProcessing(false); 
        clearWorkerAndTimeout(); // Clear global refs
      };
      localWorkerInstance.onerror = (err) => {
        if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === memoizedFileObject.name) {
          console.error('[DEBUG InquiryModal Worker ONERROR] for file:', memoizedFileObject.name, 'Error:', err);
          handleExcelValidationComplete({
            success: false, error: `Worker error: ${err.message || 'Unknown.'}`,
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: memoizedFileObject.size, isLargeFile: memoizedFileObject.size > (LARGE_FILE_THRESHOLD_MB * 1024 * 1024),
          });
        } else { console.warn('[DEBUG InquiryModal Worker ONERROR] from STALE worker/file. IGNORED.'); }
        setIsProcessing(false);
        clearWorkerAndTimeout();
      };
      
      console.log('[DEBUG InquiryModal useEffect_Main] Posting file to worker:', memoizedFileObject.name);
      localWorkerInstance.postMessage({ file: memoizedFileObject });

      localTimeoutId = setTimeout(() => {
        if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === memoizedFileObject.name) { 
            console.warn('[DEBUG InquiryModal useEffect_Main] Worker TIMEOUT for:', memoizedFileObject.name);
            handleExcelValidationComplete({
              success: false, error: 'Excel 파일 처리 시간이 초과되었습니다.',
              previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
              fileSize: memoizedFileObject.size, 
              isLargeFile: memoizedFileObject.size > (LARGE_FILE_THRESHOLD_MB * 1024 * 1024),
            });
            setIsProcessing(false); 
            clearWorkerAndTimeout();
        } else { console.log('[DEBUG InquiryModal useEffect_Main] Timeout for STALE worker/file ignored.'); }
      }, PROCESSING_TIMEOUT_MS);
      timeoutRef.current = localTimeoutId; // Update global ref
      console.log('[DEBUG InquiryModal useEffect_Main] Timeout SET. ID:', localTimeoutId);

    } else if (memoizedFileStatus === 'uploading') {
      console.log(`[DEBUG InquiryModal useEffect_Main] File status is "uploading". Clearing previous validation.`);
      setExcelValidationState(null); 
    } else if (!memoizedFileObject || memoizedFileStatus === 'error') {
      console.log(`[DEBUG InquiryModal useEffect_Main] No file or file error from dropzone (Status: ${memoizedFileStatus}). Cleaning up.`);
      setExcelValidationState( uploadedFile?.errorMessage ? { error: uploadedFile.errorMessage, hasData: false, isValid: false, headersValid: false } : null );
      setIsProcessing(false);
      clearWorkerAndTimeout();
      currentFileRef.current = null;
    }
    
    return () => {
      console.log('[DEBUG InquiryModal useEffect_Main] CLEANUP for effect with file:', memoizedFileObject?.name, 'status:', memoizedFileStatus, 'Local worker:', localWorkerInstance);
      // Clean up the worker and timeout created *in this specific effect run*
      if (localWorkerInstance) {
        console.log('[DEBUG InquiryModal useEffect_Main CLEANUP] Terminating localWorkerInstance:', localWorkerInstance);
        localWorkerInstance.terminate();
      }
      if (localTimeoutId) {
        console.log('[DEBUG InquiryModal useEffect_Main CLEANUP] Clearing localTimeoutId:', localTimeoutId);
        clearTimeout(localTimeoutId);
      }
      // If this cleanup is for the currently active worker, also clear global refs
      if (workerRef.current === localWorkerInstance) workerRef.current = null;
      if (timeoutRef.current === localTimeoutId) timeoutRef.current = null;
    };
  }, [memoizedFileStatus, memoizedFileObject, isProcessing, createExcelWorker, handleExcelValidationComplete, clearWorkerAndTimeout, uploadedFile?.errorMessage]); // isProcessing removed as primary trigger


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[DEBUG InquiryModal] handleFileChange with newFile:", newFile?.status, newFile?.name);
    
    // If a file is being processed and a new file action occurs (e.g., remove, or new upload starts)
    // we need to stop the current processing.
    if (isProcessing && workerRef.current) { // Check workerRef to be sure it's a worker processing
        console.log("[DEBUG InquiryModal handleFileChange] Currently processing Excel. Clearing existing worker/timeout before setting new file.");
        clearWorkerAndTimeout();
        setIsProcessing(false); // Stop global processing state
    }
    
    setUploadedFile(newFile);
    currentFileRef.current = newFile?.file || null; 

    if (!newFile) { // If file is removed
        console.log("[DEBUG InquiryModal handleFileChange] File removed, clearing excelValidationState.");
        setExcelValidationState(null);
    } else if (newFile.status === 'error') {
        console.log("[DEBUG InquiryModal handleFileChange] File has error status from dropzone, setting validation state.");
        setExcelValidationState({
            error: newFile.errorMessage || "Error during file selection.",
            hasData: false, isValid: false, headersValid: false
        });
    }
    // For 'uploading' or 'success', the main useEffect will handle further actions.
  }, [isProcessing, clearWorkerAndTimeout, setIsProcessing, setUploadedFile]);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.trace(`[DEBUG InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (!isOpen) {
      console.log("[DEBUG InquiryModal] Modal closing. Resetting all states.");
      setUploadedFile(null);
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      clearWorkerAndTimeout(); // Clears workerRef, timeoutRef
      setIsProcessing(false);  // Explicitly set isProcessing to false
      currentFileRef.current = null;
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout, setIsProcessing, setExcelValidationState]);

  useEffect(() => {
    console.log('[DEBUG InquiryModal] Component DID MOUNT.');
    return () => {
      console.log("[DEBUG InquiryModal] Component WILL UNMOUNT. Final cleanup.");
      clearWorkerAndTimeout();
      setIsProcessing(false);
      currentFileRef.current = null;
    };
  }, [clearWorkerAndTimeout, setIsProcessing]); 

  // Final state log before render
  console.log(`[DEBUG InquiryModal PRE-RENDER LOG] isProcessing: ${isProcessing}, fileStatus: ${uploadedFile?.status}, validationError: ${excelValidationState?.error}, validationIsValid: ${excelValidationState?.isValid}`);

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col">
        <DialogHeader className="p-6 pb-2 text-center">
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
            <div className="text-xs text-muted-foreground pt-2 space-y-0.5 text-center">
              {excelValidationState.fileSize !== undefined && ( <p>파일 크기: {(excelValidationState.fileSize / 1024).toFixed(1)}KB</p> )}
              {excelValidationState.processingTime !== undefined && ( <p>처리 시간: {excelValidationState.processingTime.toFixed(0)}ms</p> )}
              {excelValidationState.totalDataRows !== undefined && ( <p>총 데이터 행: {excelValidationState.totalDataRows}</p> )}
              {excelValidationState.error && !excelValidationState.isValid && ( <p className="text-destructive">오류: {excelValidationState.error}</p> )}
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
                onFileChange={handleFileChange}
                excelValidationState={excelValidationState}
                isProcessingGlobal={isProcessing} 
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
              (activeTab === 'excel' && (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData)) ||
              (activeTab === 'direct' && false) // Placeholder for direct entry validation
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
