
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
const PROCESSING_TIMEOUT_MS = 30000;
const LARGE_FILE_THRESHOLD_MB = 5;

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Global processing state for worker
  const [isSubmitting, setIsSubmitting] = useState(false); // For final submission loading state

  const toastHookResult = uiToastHook();
  // Defensive toast initialization
  const toast = useMemo(() => {
    if (toastHookResult && typeof toastHookResult.toast === 'function') {
      return toastHookResult.toast;
    }
    console.warn("[InquiryModal] Toast function not available from useToast. Using dummy.");
    return (options: any) => {
      console.log("DUMMY TOAST (original hook failed or not ready):", options);
      return { id: '', dismiss: () => {}, update: () => {} };
    };
  }, [toastHookResult]);


  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null); // To track the file being processed by the current worker

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
    // isProcessing should be set by the caller or the specific logic path that leads to clearing
    // setIsProcessing(false); // Avoid setting it here unconditionally as it might be called mid-process
  }, []);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse | { error: string; success?: false; hasData?: false, headersValid?: false, fileSize?: number, isLargeFile?:boolean, processingTime?: number, previewData?: null, fullData?: null, totalDataRows?: number }) => {
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success || false,
      error: result.error || null,
      hasData: result.hasData || false,
      previewData: result.previewData || null,
      fullData: result.fullData || null,
      totalDataRows: result.totalDataRows || 0,
      headersValid: result.headersValid || false,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
    };
    console.log("[InquiryModal] handleExcelValidationComplete received result, newValidationState:", newValidationResult);
    setExcelValidationState(newValidationResult);

    if (newValidationResult.isValid && newValidationResult.hasData) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
      });
      if (newValidationResult.isLargeFile) {
        toast({
            title: "Large File Processed",
            description: `Successfully processed a large file (${newValidationResult.fileSize ? (newValidationResult.fileSize / 1024 / 1024).toFixed(1) : 'N/A'}MB).`,
            variant: "default",
            duration: 5000,
        });
      }
    } else if (newValidationResult.error) {
      toast({
        title: "File Processing Issue",
        description: newValidationResult.error || "An error occurred during file processing.",
        variant: "destructive",
      });
    }
  }, [toast]);


  // Effect for handling file processing via worker
  useEffect(() => {
    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}`);
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
      console.log(`[InquiryModal useEffect_uploadedFile] Condition MET: File status is 'success'. Starting worker for: ${uploadedFile.name}. Current isProcessing: ${isProcessing}`);
      
      // Clean up any existing worker/timeout before starting a new one
      if (workerRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Terminating PREVIOUS workerRef.current');
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Clearing PREVIOUS timeoutRef.current');
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setExcelValidationState(null); // Reset previous validation
      setIsProcessing(true);
      console.log(`[InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE.`);
      currentFileRef.current = uploadedFile.file; // Track current file for this worker instance

      if (uploadedFile.file.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024) {
        toast({
            title: "Processing Large File",
            description: "The uploaded Excel file is large and may take some time to process. Please wait.",
            duration: 5000,
        });
      }
      
      try {
        console.log('[InquiryModal useEffect_uploadedFile] Attempting to create new Worker.');
        localWorkerInstance = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
        console.log('[InquiryModal useEffect_uploadedFile] New worker CREATED and assigned to localWorkerInstance:', localWorkerInstance);
        workerRef.current = localWorkerInstance;

        localWorkerInstance.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
          // Ensure this message is from the current worker and for the current file
          if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === uploadedFile.name) {
            console.log('[InquiryModal useEffect_uploadedFile] Worker ONMESSAGE. Data:', event.data);
            handleExcelValidationComplete(event.data);
            setIsProcessing(false);
            // Clear refs after processing is fully done (success or handled error from worker)
            if (workerRef.current === localWorkerInstance) workerRef.current = null;
            if (timeoutRef.current === localTimeoutId) timeoutRef.current = null; // Check if it's this run's timeout
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker ONMESSAGE from STALE worker/file. IGNORED.');
          }
        };

        localWorkerInstance.onerror = (err) => {
           if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === uploadedFile.name) {
            console.error('[InquiryModal useEffect_uploadedFile] Worker ONERROR. Error:', err);
            handleExcelValidationComplete({ success: false, error: `Worker error: ${err.message || 'Unknown.'}`, fileSize: uploadedFile.file?.size });
            setIsProcessing(false);
            if (workerRef.current === localWorkerInstance) workerRef.current = null;
            if (timeoutRef.current === localTimeoutId) timeoutRef.current = null;
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker ONERROR from STALE worker/file. IGNORED.');
          }
        };
        
        console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker with file:', uploadedFile.file.name);
        localWorkerInstance.postMessage({ file: uploadedFile.file });

        localTimeoutId = setTimeout(() => {
          if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === uploadedFile.name) {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT.');
            handleExcelValidationComplete({
              success: false,
              error: 'Excel 파일 처리 시간이 초과되었습니다. (30초)',
              fileSize: uploadedFile.file?.size,
              isLargeFile: uploadedFile.file ? uploadedFile.file.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024 : undefined,
            });
            setIsProcessing(false);
            // Terminate the timed-out worker
            localWorkerInstance?.terminate(); // Use localWorkerInstance here
            if (workerRef.current === localWorkerInstance) workerRef.current = null;
            if (timeoutRef.current === localTimeoutId) timeoutRef.current = null;
          } else {
             console.log('[InquiryModal useEffect_uploadedFile] Timeout for STALE worker/file ignored.');
          }
        }, PROCESSING_TIMEOUT_MS);
        timeoutRef.current = localTimeoutId;
        console.log('[InquiryModal useEffect_uploadedFile] Timeout SET. ID:', localTimeoutId);

      } catch (workerError: any) {
        console.error('[InquiryModal useEffect_uploadedFile] Failed to create or setup worker:', workerError);
        handleExcelValidationComplete({ success: false, error: `File processing environment error: ${workerError.message}`, fileSize: uploadedFile.file?.size });
        setIsProcessing(false);
        currentFileRef.current = null; // Reset current file ref on error
        // Ensure workerRef and timeoutRef are cleared if they were somehow set before error
        if (workerRef.current === localWorkerInstance) workerRef.current = null;
        if (timeoutRef.current === localTimeoutId) timeoutRef.current = null;
      }

    } else if (uploadedFile && uploadedFile.status === 'uploading') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for 'success'. Previous validation state cleared.`);
      setExcelValidationState(null); // Clear previous validation state while new file is "uploading"
      // Do not set isProcessing here, wait for 'success'
    } else if (!uploadedFile || uploadedFile.status === 'error') {
      console.log(`[InquiryModal useEffect_uploadedFile] File removed or initial error. Status: ${uploadedFile?.status}. Cleaning up.`);
      // Terminate any existing worker from previous runs if a file is removed or has an error from dropzone
      if (workerRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Terminating existing worker due to file removal/error.');
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Clearing existing timeout due to file removal/error.');
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsProcessing(false);
      setExcelValidationState(uploadedFile?.errorMessage ? { error: uploadedFile.errorMessage, isValid: false, hasData: false } : null);
      currentFileRef.current = null;
    }

    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker: ${localWorkerInstance} Clearing localTimeoutId: ${localTimeoutId}`);
      localWorkerInstance?.terminate();
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFile, handleExcelValidationComplete]); // isProcessing removed to prevent loops, create/setup/clearWorker are stable due to useCallback

  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile);
    // If file is removed or has an error straight from dropzone, clear validation and processing state
    if (!newFile || newFile.status === 'error') {
        setExcelValidationState(newFile?.errorMessage ? { error: newFile.errorMessage, isValid: false, hasData: false } : null);
        setIsProcessing(false);
        // Terminate any active worker if file is removed or errored out from dropzone
        if (workerRef.current) {
            console.log("[InquiryModal handleFileChange] File removed/errored, terminating active worker.");
            workerRef.current.terminate();
            workerRef.current = null;
        }
        if (timeoutRef.current) {
            console.log("[InquiryModal handleFileChange] File removed/errored, clearing active timeout.");
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        currentFileRef.current = null;
    }
  }, []);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null);
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      // Call the more robust cleanup for worker and timeout
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsProcessing(false); // Ensure processing is stopped
      currentFileRef.current = null;
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  // Final cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log("[InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleSubmitInquiry = useCallback(async () => {
    console.log("[InquiryModal] handleSubmitInquiry clicked.");
    console.log("Current Tab:", activeTab);
    console.log("Uploaded File State:", uploadedFile);
    console.log("Excel Validation State:", excelValidationState);

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        setIsSubmitting(true);
        // Simulate API call
        console.log("Submitting Excel Data:", excelValidationState.fullData);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `Successfully submitted ${excelValidationState.totalDataRows} rows from Excel.`,
        });
        setIsSubmitting(false);
        handleModalOpenChange(false); // Close modal on success
      } else {
        toast({
          title: "Cannot Submit",
          description: "Please upload a valid Excel file with data.",
          variant: "destructive",
        });
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
      setIsSubmitting(false);
      handleModalOpenChange(false);
    }
  }, [activeTab, uploadedFile, excelValidationState, toast, handleModalOpenChange]);
  
  // For debugging rendering loops or unexpected states
  console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData) {
      return true;
    }
    return false;
  };

  const isDirectSubmitDisabled = () => {
    // Placeholder: Add actual validation for direct entry form
    return isSubmitting || isProcessing;
  };

  // Final check before rendering to log the states that ExcelUploadTab will receive
  if (activeTab === 'excel') {
    console.log(`[InquiryModal] Final rendering states for ExcelUploadTab: {isProcessing: ${isProcessing}, uploadedFileStatus: ${uploadedFile?.status}, excelError: ${excelValidationState?.error}, excelHasData: ${excelValidationState?.hasData}}`);
  }


  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col">
        <DialogHeader className="p-6 pb-2 text-center sm:text-center">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
          {isProcessing && activeTab === 'excel' && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중입니다. 잠시만 기다려 주세요...
            </div>
          )}
          {!isProcessing && excelValidationState && activeTab === 'excel' && (
            <div className="text-xs text-muted-foreground pt-2 space-y-0.5 text-center">
              {excelValidationState.fileSize !== undefined && ( <p>파일 크기: {(excelValidationState.fileSize / 1024).toFixed(1)}KB</p> )}
              {excelValidationState.processingTime !== undefined && ( <p>처리 시간: {excelValidationState.processingTime.toFixed(0)}ms</p> )}
              {excelValidationState.totalDataRows !== undefined && ( <p>총 데이터 행: {excelValidationState.totalDataRows}</p> )}
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
                onFileChange={handleFileChange} // Pass the callback to ExcelUploadTab
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

