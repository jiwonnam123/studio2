
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
import { DirectEntryTab, type DirectEntryTabHandles } from './DirectEntryTab';
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse, WorkerParseRequest } from '@/types/inquiry';
import { SubmittedInquiry, SubmittedInquiryDataRow } from '@/types'; // Ensure these are imported
import { useToast as uiToastHook } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase'; // Import firestore instance
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const PROCESSING_TIMEOUT_MS = 5000; // 5초 (프롬프트에 따라 단축)

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
  const [isSubmitting, setIsSubmitting] = useState(false); // For DB submission

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null); // Track file being processed by current worker
  const directEntryTabRef = useRef<DirectEntryTabHandles>(null);

  const toastHookInstance = uiToastHook();
  const toast = useMemo(() => {
    if (toastHookInstance && typeof toastHookInstance.toast === 'function') {
      return toastHookInstance.toast;
    }
    console.warn("[InquiryModal] Toast function not available from useToast. Using dummy.");
    const dummyToast = (options: any) => { // Renamed to avoid conflict
      console.log("DUMMY TOAST (hook disabled or not ready):", options);
      return { id: '', dismiss: () => {}, update: () => {} };
    };
    return dummyToast;
  }, [toastHookInstance]);
  
  const { user } = useAuth();

  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[DEBUG InquiryModal] clearWorkerAndTimeout called.');
    if (workerRef.current) {
      console.log('[DEBUG InquiryModal clearWorkerAndTimeout] Terminating workerRef.current:', workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (timeoutRef.current) {
      console.log('[DEBUG InquiryModal clearWorkerAndTimeout] Clearing timeoutRef.current:', timeoutRef.current);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // This should be called by the logic that decides processing is truly over
    // setIsProcessing(false); 
  }, []);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success || false,
      error: result.error || null,
      hasData: result.dataExistsInSheet || false,
      previewData: result.previewData || null,
      fullData: result.fullData || null, // Store full data for submission
      totalDataRows: result.totalDataRows || 0,
      headersValid: result.headersValid || false,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
    };
    console.log("[DEBUG InquiryModal] handleExcelValidationComplete received result:", newValidationResult);
    
    setExcelValidationState(newValidationResult);

    if (newValidationResult.isValid && newValidationResult.hasData) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview available. All rows will be processed.`,
      });
    } else if (newValidationResult.isLargeFile && newValidationResult.isValid && !newValidationResult.error) {
        toast({
            title: "Large File Processed",
            description: `Successfully processed a large file (${newValidationResult.fileSize ? (newValidationResult.fileSize / 1024 / 1024).toFixed(1) : 'N/A'}MB).`,
            variant: "default",
            duration: 5000,
        });
    } else if (newValidationResult.error) {
       // Error already displayed in ExcelUploadTab, no separate toast here unless desired
    }
  }, [toast]);

  const createExcelWorker = useCallback((): Worker | null => {
    console.log('[DEBUG InquiryModal createExcelWorker] Attempting to create worker.');
    try {
      if (typeof Worker === 'undefined') {
        console.error('[ERROR InquiryModal createExcelWorker] Worker not supported in this environment.');
        handleExcelValidationComplete({
          type: 'result', success: false, error: 'Web Workers are not supported in your browser.',
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: 0,
        });
        return null;
      }
      const worker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[DEBUG InquiryModal createExcelWorker] Worker CREATED successfully:', worker);
      return worker;
    } catch (error) {
      console.error('[ERROR InquiryModal createExcelWorker] Worker creation failed:', error);
       handleExcelValidationComplete({
          type: 'result', success: false, error: 'Excel processing environment could not be initialized.',
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: 0,
        });
      return null;
    }
  }, [handleExcelValidationComplete]);

  const setupWorkerHandlers = useCallback((worker: Worker, associatedFile: File) => {
    console.log('[DEBUG InquiryModal setupWorkerHandlers] Setting up handlers for worker and file:', associatedFile.name);

    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      if (workerRef.current === worker && currentFileRef.current?.name === associatedFile.name) {
        if (event.data.type === 'progress') {
          console.log(`[DEBUG InquiryModal handleWorkerMessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
          return; 
        }
        console.log('[DEBUG InquiryModal handleWorkerMessage] Worker ONMESSAGE. Data:', event.data);
        handleExcelValidationComplete(event.data);
        setIsProcessing(false); 
        clearWorkerAndTimeout();
      } else {
         console.warn('[DEBUG InquiryModal handleWorkerMessage] Received message from STALE worker/file. IGNORED.');
      }
    };

    worker.onerror = (errorEvent) => {
       if (workerRef.current === worker && currentFileRef.current?.name === associatedFile.name) {
        console.error('[DEBUG InquiryModal handleWorkerError] Worker ONERROR. ErrorEvent:', errorEvent);
        handleExcelValidationComplete({
          type: 'result', success: false, error: `Worker error: ${errorEvent.message || 'Unknown worker error.'}`,
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: associatedFile.size, isLargeFile: associatedFile.size > (5 * 1024 * 1024)
        });
        setIsProcessing(false);
        clearWorkerAndTimeout();
      } else {
        console.warn('[DEBUG InquiryModal handleWorkerError] Received error from STALE worker/file. IGNORED.');
      }
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);
  
  const memoizedFileObject = useMemo(() => uploadedFile?.file, [uploadedFile?.file]);
  const memoizedFileStatus = useMemo(() => uploadedFile?.status, [uploadedFile?.status]);

  useEffect(() => {
    console.log('[DEBUG InquiryModal useEffect_uploadedFile] TRIGGERED.', { uploadedFileStatus: memoizedFileStatus, fileObjectExists: !!memoizedFileObject, isProcessing });
    
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (memoizedFileStatus === 'success' && memoizedFileObject && !isProcessing && !workerRef.current) {
      console.log('[DEBUG InquiryModal useEffect_uploadedFile] Entered SUCCESS block for file:', memoizedFileObject.name);
      
      currentFileRef.current = memoizedFileObject;
      setExcelValidationState(null);
      setIsProcessing(true);
      console.log('[DEBUG InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE.');

      if (memoizedFileObject.size > 10 * 1024 * 1024) { // 10MB for very large file warning
        toast({
            title: "Processing Very Large File",
            description: `The uploaded Excel file (${(memoizedFileObject.size / (1024*1024)).toFixed(1)}MB) is very large and may take some time. Please wait.`,
            duration: 10000,
        });
      }
      
      localWorkerInstance = createExcelWorker();

      if (!localWorkerInstance) {
        console.error("[DEBUG InquiryModal useEffect_uploadedFile] Failed to create worker instance in SUCCESS block.");
        setIsProcessing(false); // Reset processing if worker creation fails
        currentFileRef.current = null;
        return; // Exit if worker creation failed
      }
      
      workerRef.current = localWorkerInstance;
      setupWorkerHandlers(localWorkerInstance, memoizedFileObject);
      
      console.log('[DEBUG InquiryModal useEffect_uploadedFile] Posting message to worker with file:', memoizedFileObject.name);
      localWorkerInstance.postMessage({ file: memoizedFileObject } as WorkerParseRequest);

      localTimeoutId = setTimeout(() => {
        if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === memoizedFileObject.name) { 
            console.warn('[DEBUG InquiryModal useEffect_uploadedFile] Worker TIMEOUT for file:', memoizedFileObject.name);
            handleExcelValidationComplete({
                type: 'result', success: false, error: `Excel file processing timed out (${PROCESSING_TIMEOUT_MS / 1000} seconds).`,
                previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                fileSize: memoizedFileObject.size, isLargeFile: memoizedFileObject.size > (5 * 1024 * 1024)
            });
            setIsProcessing(false);
            clearWorkerAndTimeout();
        } else {
             console.log('[DEBUG InquiryModal useEffect_uploadedFile] Timeout for STALE worker/file. IGNORED.');
        }
      }, PROCESSING_TIMEOUT_MS);
      timeoutRef.current = localTimeoutId;

    } else if (memoizedFileStatus === 'uploading') {
      console.log('[DEBUG InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for \'success\'. Previous validation state cleared.');
      setExcelValidationState(null); // Clear previous validation while "uploading"
    } else if (!memoizedFileObject || memoizedFileStatus === 'error' || memoizedFileStatus === 'idle') {
      console.log(`[DEBUG InquiryModal useEffect_uploadedFile] File removed, initial error, or idle. Status: ${memoizedFileStatus}. Cleaning up.`);
      clearWorkerAndTimeout(); // Clean up if file is removed or has dropzone error
      setIsProcessing(false); // Ensure processing is false
      if (memoizedFileStatus === 'error' && uploadedFile?.errorMessage) {
        setExcelValidationState({ isValid: false, error: uploadedFile.errorMessage, hasData: false });
      } else if (!memoizedFileObject) {
         setExcelValidationState(null);
      }
    }

    return () => {
      console.log(`[DEBUG InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker: ${localWorkerInstance} Clearing localTimeoutId: ${localTimeoutId}`);
      if (localWorkerInstance) {
        localWorkerInstance.terminate();
      }
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
       // If the component unmounts while processing, workerRef might still be set
      // This cleanup tries to catch that, but primary cleanup is in onmessage/onerror/timeout
      if (workerRef.current && workerRef.current === localWorkerInstance) {
         console.log("[DEBUG InquiryModal useEffect_uploadedFile CLEANUP] Terminating workerRef.current as it matches localWorkerInstance");
         workerRef.current.terminate();
         workerRef.current = null;
      }
       if (timeoutRef.current && timeoutRef.current === localTimeoutId) {
         console.log("[DEBUG InquiryModal useEffect_uploadedFile CLEANUP] Clearing timeoutRef.current as it matches localTimeoutId");
         clearTimeout(timeoutRef.current);
         timeoutRef.current = null;
      }
      // Do not set isProcessing to false here as it might interfere with ongoing worker if this cleanup is premature for current processing cycle.
      // It should be set to false by onmessage, onerror, or timeout handlers.
    };
  }, [memoizedFileObject, memoizedFileStatus, isProcessing, createExcelWorker, setupWorkerHandlers, clearWorkerAndTimeout, handleExcelValidationComplete, toast, uploadedFile?.errorMessage]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[DEBUG InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile); // This will trigger the useEffect above

    if (!newFile || newFile.status !== 'success') {
        // If file is removed or has an initial error from FileUploadZone,
        // clear previous validation state and ensure processing stops.
        // The main useEffect will handle more detailed cleanup based on newFile state.
        console.log("[DEBUG InquiryModal handleFileChange] File removed or dropzone error. Setting excelValidationState to null.");
        setExcelValidationState(null);
        // setIsProcessing(false); // Let useEffect handle this based on newFile.status
        // clearWorkerAndTimeout(); // Let useEffect handle this.
    }
  }, []);

  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[DEBUG InquiryModal] handleModalOpenChange: Setting open to ${isOpen}.`);
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[DEBUG InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    if (!isOpen) {
      console.log("[DEBUG InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); 
      setExcelValidationState(null);
      setActiveTab('excel');
      // setIsProcessing(false); // clearWorkerAndTimeout will handle this
      clearWorkerAndTimeout();
      currentFileRef.current = null;
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout]);

  // Final cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log("[DEBUG InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
    };
  }, [clearWorkerAndTimeout]);

  const handleSubmitInquiry = useCallback(async () => {
    console.log("[DEBUG InquiryModal handleSubmitInquiry] Clicked.");
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to submit an inquiry.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    let dataToSubmit: string[][] | null = null;
    let source: 'excel' | 'direct' = activeTab;
    let submissionFileName: string | undefined = undefined;

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        dataToSubmit = excelValidationState.fullData;
        submissionFileName = uploadedFile?.name;
      } else {
        toast({
          title: "Cannot Submit",
          description: excelValidationState?.error || "Please upload a valid Excel file with data.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      const gridData = directEntryTabRef.current?.getGridData();
      if (gridData && gridData.length > 0) {
        dataToSubmit = gridData;
      } else {
        toast({ title: "No Data", description: "Please enter data in the grid to submit.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    }

    if (!dataToSubmit || dataToSubmit.length === 0) {
      toast({ title: "No Data", description: "No data to submit.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const inquiryDataRows: SubmittedInquiryDataRow[] = dataToSubmit.map(row => ({
      campaignKey: row[0] || '',
      campaignName: row[1] || '',
      adidOrIdfa: row[2] || '',
      userName: row[3] || '',
      contact: row[4] || '',
      remarks: row[5] || '',
    }));

    const inquiryDoc: SubmittedInquiry = {
      userId: user.id,
      submittedAt: serverTimestamp(),
      source: source,
      fileName: submissionFileName,
      data: inquiryDataRows,
    };

    try {
      console.log("[DEBUG InquiryModal handleSubmitInquiry] Submitting to Firestore:", inquiryDoc);
      await addDoc(collection(firestore, "inquiries"), inquiryDoc);
      toast({
        title: "Inquiry Submitted!",
        description: `Successfully submitted ${inquiryDataRows.length} rows.`,
      });
      handleModalOpenChange(false); // Close modal on success
    } catch (error: any) {
      console.error("Error submitting inquiry to Firestore:", error);
      toast({
        title: "Submission Error",
        description: `Could not submit inquiry: ${error.message || 'Unknown Firestore error.'}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [activeTab, excelValidationState, uploadedFile?.name, user, toast, handleModalOpenChange]);
  
  useEffect(() => {
    console.log('[DEBUG InquiryModal State changed (for render / ExcelUploadTab props)]:', {
      timestamp: new Date().toISOString(),
      isProcessing,
      uploadedFileStatus: uploadedFile?.status,
      uploadedFileName: uploadedFile?.name,
      excelError: excelValidationState?.error,
      excelHasData: excelValidationState?.hasData,
      excelIsValid: excelValidationState?.isValid,
      excelTotalRows: excelValidationState?.totalDataRows,
      workerExists: !!workerRef.current,
      timeoutExists: !!timeoutRef.current
    });
  }, [isProcessing, uploadedFile, excelValidationState]);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData) {
      return true;
    }
    return false;
  };

  const isDirectSubmitDisabled = () => {
    // Check if directEntryTabRef.current has data
    // This is a simplified check; ideally, directEntryTabRef.current.getGridData().length > 0
    // For now, just rely on isSubmitting or isProcessing
    return isSubmitting || isProcessing; 
  };
  
  console.log(`[DEBUG InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);
  console.log(`[DEBUG InquiryModal] Final rendering states for ExcelUploadTab:`, {
      isProcessing: isProcessing,
      uploadedFileStatus: uploadedFile?.status,
      excelError: excelValidationState?.error,
      excelHasData: excelValidationState?.hasData
  });

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
        <DialogHeader className="p-6 pb-2 text-center">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
          {isProcessing && activeTab === 'excel' && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중... ({(uploadedFile?.size || 0 / 1024 / 1024).toFixed(1)}MB)
              {excelValidationState?.processingTime !== undefined && excelValidationState?.fileSize !== undefined && (
                ` | 처리 시간: ${excelValidationState.processingTime.toFixed(0)}ms`
              )}
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
              <DirectEntryTab ref={directEntryTabRef} />
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
            {(isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Inquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
