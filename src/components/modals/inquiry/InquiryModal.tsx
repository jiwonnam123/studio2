
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
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse, WorkerParseRequest, SubmittedInquiryDataRow } from '@/types';
import { useToast as useActualToast } from '@/hooks/use-toast'; // Re-enable actual toast
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, type DocumentData } from 'firebase/firestore';

const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds for processing
const ADMIN_EMAIL = 'jirrral@gmail.com'; // Define admin email

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

// const uiToastHook = useActualToast; // For testing with dummy toast
// const dummyToast = (options: any) => {
//   console.warn("DUMMY TOAST (actual toast disabled):", options);
//   return { id: '', dismiss: () => {}, update: () => {} };
// };

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const toastHookResult = useActualToast();
  const toast = toastHookResult?.toast || ((options: any) => {
    console.warn("Toast function not available, dummy used. Options:", options);
    return { id: '', dismiss: () => {}, update: () => {} };
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Global processing state for worker
  const [isSubmitting, setIsSubmitting] = useState(false); // For DB submission

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const directEntryTabRef = useRef<DirectEntryTabHandles>(null);
  const currentFileRef = useRef<File | null>(null); // To track the file being processed by the current worker

  const { user } = useAuth();

  // Memoized callbacks
  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[InquiryModal] clearWorkerAndTimeout called.');
    if (workerRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Terminating worker:', workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (timeoutRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Clearing timeout:', timeoutRef.current);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // setIsProcessing(false); // This will be set by the calling context (onmessage, onerror, ontimeout, or cleanup)
  }, []);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    console.log("[InquiryModal] handleExcelValidationComplete received result:", result);
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success, // Assuming worker's 'success' means overall validity for submission
      error: result.error || null,
      hasData: result.dataExistsInSheet || false,
      previewData: result.previewData || null,
      fullData: result.fullData || null, // Store full data
      totalDataRows: result.totalDataRows || 0,
      headersValid: result.headersValid || false,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
    };

    setExcelValidationState(newValidationResult);

    if (newValidationResult.isValid && newValidationResult.hasData) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
      });
    } else if (newValidationResult.isLargeFile && !newValidationResult.error) {
       toast({
        title: "Large File Processed",
        description: `Successfully processed a large file (${((newValidationResult.fileSize || 0) / (1024*1024)).toFixed(1)}MB). Preview might be limited.`,
        variant: "default"
      });
    }
    // Errors are displayed within ExcelUploadTab based on excelValidationState.error
  }, [toast]);


  const createExcelWorker = useCallback((): Worker | null => {
    try {
      if (typeof Worker === 'undefined') {
        console.error('[InquiryModal createExcelWorker] Worker not supported in this browser.');
        handleExcelValidationComplete({
          success: false, error: 'Web Workers are not supported in your browser.',
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: currentFileRef.current?.size || 0,
          isLargeFile: (currentFileRef.current?.size || 0) > 5 * 1024 * 1024,
          type: 'result'
        });
        return null;
      }
      const workerInstance = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[InquiryModal createExcelWorker] Worker CREATED successfully:', workerInstance);
      return workerInstance;
    } catch (error) {
      console.error('[InquiryModal createExcelWorker] Worker creation FAILED:', error);
      handleExcelValidationComplete({
        success: false, error: 'Excel processing environment could not be initialized.',
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: currentFileRef.current?.size || 0,
        isLargeFile: (currentFileRef.current?.size || 0) > 5 * 1024 * 1024,
        type: 'result'
      });
      return null;
    }
  }, [handleExcelValidationComplete]);

  const setupWorkerHandlers = useCallback((worker: Worker, processingFile: File) => {
    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      if (currentFileRef.current !== processingFile || workerRef.current !== worker) {
        console.warn('[InquiryModal setupWorkerHandlers] Received message from STALE or MISMATCHED worker/file. IGNORED.');
        worker.terminate(); // Terminate the specific worker instance that sent the stale message
        return;
      }
      console.log('[InquiryModal setupWorkerHandlers] Worker ONMESSAGE. Data:', event.data);
      if (event.data.type === 'progress') {
        console.log(`[InquiryModal handleWorkerMessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
        return;
      }
      handleExcelValidationComplete(event.data);
      setIsProcessing(false);
      console.log('[InquiryModal setupWorkerHandlers ONMESSAGE] Set isProcessing to FALSE.');
      clearWorkerAndTimeout();
    };

    worker.onerror = (errorEvent: ErrorEvent) => {
      if (currentFileRef.current !== processingFile || workerRef.current !== worker) {
        console.warn('[InquiryModal setupWorkerHandlers] Received error from STALE or MISMATCHED worker/file. IGNORED.');
        worker.terminate();
        return;
      }
      console.error('[InquiryModal setupWorkerHandlers] Worker ONERROR. ErrorEvent:', errorEvent);
      handleExcelValidationComplete({
        type: 'result', success: false, error: `Worker error: ${errorEvent.message || 'Unknown worker error.'}`,
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: processingFile.size, isLargeFile: processingFile.size > (5 * 1024 * 1024)
      });
      setIsProcessing(false);
      console.log('[InquiryModal setupWorkerHandlers ONERROR] Set isProcessing to FALSE.');
      clearWorkerAndTimeout();
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);


  useEffect(() => {
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}`);

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
      console.log(`[InquiryModal useEffect_uploadedFile] File is 'success'. Current isProcessing: ${isProcessing}, workerRef: ${workerRef.current}`);
      if (isProcessing || workerRef.current) { // Already processing or a worker exists (should have been cleaned up)
        console.warn('[InquiryModal useEffect_uploadedFile] Already processing or worker exists. Cleaning up before new start.', {isProcessing, workerExists: !!workerRef.current});
        clearWorkerAndTimeout(); // Ensure cleanup before new start
        // If already processing, we might want to prevent new worker start or handle differently
        // For now, we assume previous cleanup should have set isProcessing to false
      }

      console.log('[InquiryModal useEffect_uploadedFile] Condition MET: File status is "success". Starting worker for:', uploadedFile.name);
      currentFileRef.current = uploadedFile.file; // Set ref to current file

      setExcelValidationState(null); // Clear previous validation
      setIsProcessing(true);
      console.log('[InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE.');

      if (uploadedFile.file.size > 5 * 1024 * 1024) { // 5MB
        toast({
            title: "Processing Large File",
            description: `Your file is ${(uploadedFile.file.size / (1024*1024)).toFixed(1)}MB. Processing may take some time.`,
            variant: "default",
        });
      }

      localWorkerInstance = createExcelWorker();
      if (!localWorkerInstance) {
        setIsProcessing(false);
        console.log('[InquiryModal useEffect_uploadedFile] Worker creation FAILED. isProcessing set to FALSE.');
        return; // Exit if worker creation failed
      }
      workerRef.current = localWorkerInstance; // Assign to ref
      setupWorkerHandlers(localWorkerInstance, uploadedFile.file);

      console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker with file:', uploadedFile.file.name);
      localWorkerInstance.postMessage({ file: uploadedFile.file } as WorkerParseRequest);

      localTimeoutId = setTimeout(() => {
        if (workerRef.current === localWorkerInstance && currentFileRef.current === uploadedFile.file) { // Check if it's still the same worker & file
          console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for worker:', localWorkerInstance, 'File:', uploadedFile.file.name);
          handleExcelValidationComplete({
            type: 'result', success: false, error: `Excel file processing timed out after ${PROCESSING_TIMEOUT_MS / 1000} seconds.`,
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: uploadedFile.file.size, isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024)
          });
          setIsProcessing(false); // Ensure isProcessing is reset
          console.log('[InquiryModal useEffect_uploadedFile TIMEOUT] Set isProcessing to FALSE.');
          clearWorkerAndTimeout();
        } else {
            console.log('[InquiryModal useEffect_uploadedFile] Timeout for STALE or MISMATCHED worker/file. IGNORED.');
        }
      }, PROCESSING_TIMEOUT_MS);
      timeoutRef.current = localTimeoutId; // Assign to ref

    } else if (uploadedFile && (uploadedFile.status === 'uploading')) {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "${uploadedFile.status}". Waiting for 'success'. Previous validation state cleared.`);
      setExcelValidationState(null); // Clear validation when new file is 'uploading'
      // Do not clear worker here, as it might be for a previous file that timed out, or a new one hasn't started.
    } else if (uploadedFile && uploadedFile.status === 'error') { // Error from FileUploadZone
        console.log(`[InquiryModal useEffect_uploadedFile] File status is 'error' from dropzone. Error:`, uploadedFile.errorMessage);
        setExcelValidationState({ error: uploadedFile.errorMessage || "File upload failed.", isValid: false, hasData: false });
        setIsProcessing(false); // Ensure processing stops
        clearWorkerAndTimeout();
    } else if (!uploadedFile) { // File removed
        console.log('[InquiryModal useEffect_uploadedFile] No file (file removed). Cleaning up.');
        setExcelValidationState(null);
        setIsProcessing(false);
        clearWorkerAndTimeout();
    }


    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker (if it was this run's worker): ${localWorkerInstance} Clearing localTimeoutId: ${localTimeoutId}`);
      if (localWorkerInstance) {
        localWorkerInstance.terminate();
      }
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
    };
  }, [uploadedFile, createExcelWorker, setupWorkerHandlers, handleExcelValidationComplete, clearWorkerAndTimeout, toast]);
  // isProcessing removed from dependency array to prevent loops. It's managed internally or by worker events.


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    currentFileRef.current = newFile?.file || null; // Update currentFileRef immediately
    setUploadedFile(newFile); // This will trigger the useEffect above
  }, []);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}.`);
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); // Triggers useEffect to clean up
      setExcelValidationState(null);
      setIsProcessing(false); // Ensure isProcessing is false when modal closes
      clearWorkerAndTimeout();
      currentFileRef.current = null;
      setActiveTab('excel');
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout]);


  useEffect(() => {
    // Final cleanup on component unmount
    return () => {
      console.log("[InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
    };
  }, [clearWorkerAndTimeout]);

  const handleSubmitInquiry = useCallback(async () => {
    console.log("[InquiryModal handleSubmitInquiry] Clicked.");
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to submit an inquiry.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    let dataToProcess: string[][] = [];
    let sourceForDB: 'excel' | 'direct' = activeTab;
    let fileNameForDB: string | undefined = undefined;

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        dataToProcess = excelValidationState.fullData;
        fileNameForDB = uploadedFile?.name;
      } else {
        toast({
          title: "Cannot Submit",
          description: excelValidationState?.error || "Please upload a valid Excel file with data, or ensure data exists after header.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      const gridData = directEntryTabRef.current?.getGridData();
      if (gridData && gridData.length > 0) {
         dataToProcess = gridData;
      } else {
        toast({ title: "No Data", description: "Please enter data in the grid to submit.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    }

    if (dataToProcess.length === 0) {
      toast({ title: "No Data", description: "No data rows to submit.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const dataRowsToSubmit: SubmittedInquiryDataRow[] = dataToProcess.map(row => ({
        campaignKey: row[0] || '',
        campaignName: row[1] || '',
        adidOrIdfa: row[2] || '',
        userName: row[3] || '',
        contact: row[4] || '',
        remarks: row[5] || '',
        status: "Pending", // Default status for new inquiries
        adminNotes: "", // Default empty admin notes
    }));


    const inquiryDoc: DocumentData = {
      userId: user.id,
      submittedAt: serverTimestamp(),
      source: sourceForDB,
      data: dataRowsToSubmit,
    };
    if (fileNameForDB) {
      inquiryDoc.fileName = fileNameForDB;
    }

    console.log("[InquiryModal handleSubmitInquiry] Attempting to submit document:", JSON.stringify(inquiryDoc).substring(0, 500) + "..."); // Log partial data

    try {
      await addDoc(collection(firestore, "inquiries"), inquiryDoc);
      toast({
        title: "Inquiry Submitted!",
        description: `Successfully submitted ${dataRowsToSubmit.length} rows.`,
      });
      handleModalOpenChange(false);
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

  const isSubmitDisabled = useMemo(() => {
    if (isSubmitting || isProcessing) return true;
    if (activeTab === 'excel') {
      return !excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData;
    }
    if (activeTab === 'direct') {
      // For direct entry, we can't easily check data without calling getGridData here,
      // which might be slow. So, we allow submit and validate in handleSubmitInquiry.
      // Alternatively, add a local state in DirectEntryTab to track if it has data.
      return false;
    }
    return true;
  }, [isSubmitting, isProcessing, activeTab, excelValidationState]);
  
  console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);
  // For debugging ExcelUploadTab props
  console.log(`[InquiryModal] Final rendering states for ExcelUploadTab: {isProcessing: ${isProcessing}, uploadedFileStatus: ${uploadedFile?.status}, excelError: ${excelValidationState?.error}, excelHasData: ${excelValidationState?.hasData}}`);


  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent
        className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col"
        onInteractOutside={(event) => {
          if (isProcessing || isSubmitting) {
            console.log("[InquiryModal DialogContent] onInteractOutside prevented due to isProcessing or isSubmitting.");
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="p-6 pb-2 text-center">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
           {isProcessing && uploadedFile?.file && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중... ({((uploadedFile.file.size || 0) / 1024).toFixed(1)}KB)
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
              <DirectEntryTab ref={directEntryTabRef} />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="p-6 border-t bg-muted/30 flex-shrink-0">
          <Button
            type="button"
            onClick={handleSubmitInquiry}
            className="w-full sm:w-auto"
            disabled={isSubmitDisabled}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Inquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
