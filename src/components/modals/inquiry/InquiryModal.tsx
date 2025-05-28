
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
import { toast as uiToastHook } from '@/hooks/use-toast'; 
import { Loader2 } from 'lucide-react';

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';
const PROCESSING_TIMEOUT_MS = 30000;
const LARGE_FILE_WARNING_THRESHOLD_MB = 5 * 1024 * 1024;

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 

  const workerRef = useRef<Worker | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = uiToastHook();

  const clearWorkerAndTimeout = useCallback(() => {
    console.log("[InquiryModal] clearWorkerAndTimeout called. Current workerRef:", workerRef.current, "Current timeoutRef:", processingTimeoutRef.current);
    if (workerRef.current) {
      console.log("[InquiryModal] Terminating existing worker:", workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (processingTimeoutRef.current) {
      console.log("[InquiryModal] Clearing existing timeout:", processingTimeoutRef.current);
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    // setIsProcessing(false) should be called by the logic that finishes processing
    // or when explicitly stopping processing (e.g., file removal, modal close).
  }, []);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    console.log("[InquiryModal] handleExcelValidationComplete received result:", result);
    
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
    // setIsProcessing(false) is called by the worker/timeout cleanup logic that calls this

    if (result.isLargeFile && !result.error && result.dataExistsInSheet) {
      toast({
        title: "대용량 파일 처리 완료",
        description: `${result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(1) : 'Large'}MB 파일 (${result.totalDataRows || 0} 행) 처리가 완료되었습니다.`,
      });
    } else if (!result.error && result.dataExistsInSheet) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${result.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
      });
    }
  }, [toast]); // toast is stable from useToast hook

  // Effect to manage worker based on uploadedFile state
  useEffect(() => {
    console.log('[InquiryModal useEffect_uploadedFile] START. uploadedFile:', uploadedFile, 'isProcessing:', isProcessing);

    // This localWorker is specific to this run of the useEffect
    let localWorker: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    // Always clear any globally-referenced worker/timeout from previous effect runs or other logic
    // This is crucial to prevent stale workers or multiple workers running.
    clearWorkerAndTimeout();
    // Also reset isProcessing here, it will be set to true if a new worker starts.
    setIsProcessing(false);


    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
      console.log('[InquiryModal useEffect_uploadedFile] Condition MET: File status is "success". Starting worker for:', uploadedFile.name);
      
      setExcelValidationState(null); // Clear previous validation state immediately
      setIsProcessing(true); // Set global processing state

      if (uploadedFile.file.size > LARGE_FILE_WARNING_THRESHOLD_MB) {
        toast({
          title: "대용량 파일 처리 중",
          description: `파일 크기가 ${(uploadedFile.file.size / 1024 / 1024).toFixed(1)}MB 입니다. 처리에 시간이 걸릴 수 있습니다.`,
          duration: 5000,
        });
      }
      
      localWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = localWorker; // Store reference to the current worker
      console.log('[InquiryModal useEffect_uploadedFile] New worker CREATED and assigned to workerRef:', localWorker);

      localWorker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
        console.log('[InquiryModal useEffect_uploadedFile] Worker ONMESSAGE. Message from worker:', localWorker);
        // Check if the message is from the worker this effect instance is managing (or the global ref if it's the same)
        if (workerRef.current === localWorker) { 
          console.log('[InquiryModal useEffect_uploadedFile] Worker message received for current worker:', event.data);
          handleExcelValidationComplete(event.data);
          clearWorkerAndTimeout(); // Worker finished, cleanup
          setIsProcessing(false);   // Ensure processing is false
        } else {
          console.warn('[InquiryModal useEffect_uploadedFile] Message from STALE worker ignored. Terminating stale worker:', event.currentTarget);
          (event.currentTarget as Worker)?.terminate();
        }
      };

      localWorker.onerror = (err) => {
        console.error('[InquiryModal useEffect_uploadedFile] Worker ONERROR. Error from worker:', localWorker);
        if (workerRef.current === localWorker && uploadedFile?.file) {
          console.error('[InquiryModal useEffect_uploadedFile] Worker error for current worker:', err);
          handleExcelValidationComplete({
            error: `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`,
            previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: uploadedFile.file.size,
            isLargeFile: uploadedFile.file.size > LARGE_FILE_WARNING_THRESHOLD_MB,
          });
          clearWorkerAndTimeout(); 
          setIsProcessing(false); 
        } else {
          console.warn('[InquiryModal useEffect_uploadedFile] Error from STALE worker ignored. Terminating stale worker:', err.currentTarget);
          (err.currentTarget as Worker)?.terminate?.();
        }
      };

      localTimeoutId = setTimeout(() => {
        console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT. Timed out worker:', localWorker);
        if (workerRef.current === localWorker && uploadedFile?.file) {
          console.warn('[InquiryModal useEffect_uploadedFile] Worker processing timed out for file:', uploadedFile.name);
          handleExcelValidationComplete({
            error: 'File parsing timed out. The file might be too large or complex.',
            previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: uploadedFile.file.size,
            isLargeFile: uploadedFile.file.size > LARGE_FILE_WARNING_THRESHOLD_MB,
          });
          clearWorkerAndTimeout(); 
          setIsProcessing(false); 
        } else {
           console.warn('[InquiryModal useEffect_uploadedFile] Timeout for STALE worker ignored.');
        }
      }, PROCESSING_TIMEOUT_MS);
      processingTimeoutRef.current = localTimeoutId;
      console.log('[InquiryModal useEffect_uploadedFile] Timeout SET and assigned to processingTimeoutRef:', localTimeoutId);

      console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker:', localWorker, 'for file:', uploadedFile.file.name);
      localWorker.postMessage({ file: uploadedFile.file });

    } else if (uploadedFile && (uploadedFile.status === 'uploading' || uploadedFile.status === 'error')) {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "${uploadedFile.status}". No worker started. Error from dropzone:`, uploadedFile.errorMessage);
      if (uploadedFile.status === 'error') {
        setExcelValidationState({
          error: uploadedFile.errorMessage || "File upload failed.",
          hasData: false,
          headersValid: false,
          totalDataRows: 0,
          previewData: null,
          fileSize: uploadedFile.size,
          isLargeFile: uploadedFile.size > LARGE_FILE_WARNING_THRESHOLD_MB,
        });
      } else { // 'uploading'
         setExcelValidationState(null); 
      }
      setIsProcessing(false); // Not processing with worker if status is 'uploading' or 'error' from dropzone
      // clearWorkerAndTimeout() was called at the start.
    
    } else { // No uploadedFile (e.g., file removed or initial state)
      console.log('[InquiryModal useEffect_uploadedFile] No valid file or file removed. Cleaning up states.');
      setExcelValidationState(null);
      setIsProcessing(false);
      // clearWorkerAndTimeout() was called at the start.
    }

    return () => {
      console.log('[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker:', localWorker, 'Clearing localTimeoutId:', localTimeoutId);
      localWorker?.terminate();
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
      // If workerRef.current happens to be this localWorker, it means no new effect run has replaced it.
      // It should have been nulled by clearWorkerAndTimeout if the worker completed/errored/timedout.
      // If the effect is re-running due to dependency change before completion, localWorker.terminate() handles it.
    };
  }, [uploadedFile, handleExcelValidationComplete, toast, clearWorkerAndTimeout]);

  const handleFileChange = useCallback((newUploadedFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with:", newUploadedFile);
    setUploadedFile(newUploadedFile);
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
        let description = "Cannot submit. Please ensure a valid Excel file with data and correct headers is uploaded.";
        if (uploadedFile && uploadedFile.status === 'error' && uploadedFile.errorMessage) {
          description = uploadedFile.errorMessage;
        } else if (excelValidationState?.error) {
          description = excelValidationState.error;
        } else if (excelValidationState && !excelValidationState.headersValid) {
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
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting all states and cleaning worker/timeout.");
      setUploadedFile(null); // This will trigger the useEffect to cleanup worker
      setExcelValidationState(null);
      setActiveTab('excel');
      // setIsProcessing(false); // useEffect will handle this
      setIsSubmitting(false);
      // clearWorkerAndTimeout(); // useEffect listening to uploadedFile will handle this via its cleanup
    }
    onOpenChange(isOpen);
  }, [onOpenChange]); // Removed clearWorkerAndTimeout from here, let useEffect handle it
  
  useEffect(() => {
    return () => {
      console.log("[InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
    };
  }, [clearWorkerAndTimeout]);


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

  console.log("[InquiryModal] Rendering. isProcessing:", isProcessing, "uploadedFile:", uploadedFile, "excelValidationState:", excelValidationState);

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
            <TabsTrigger value="excel" disabled={isProcessing || isSubmitting}>Excel Upload</TabsTrigger>
            <TabsTrigger value="direct" disabled={isProcessing || isSubmitting}>Direct Entry</TabsTrigger>
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
            {(isSubmitting || (isProcessing && activeTab === 'excel')) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Inquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    