
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = uiToastHook();
  // console.log("[InquiryModal] Rendering.", { isProcessing, uploadedFile: uploadedFile ? {...uploadedFile, file:uploadedFile.file?.name} : null , excelValidationState }); // Log file name for brevity
  console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);


  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[InquiryModal] clearWorkerAndTimeout called.');
    if (workerRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Terminating worker.');
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (processingTimeoutRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Clearing timeout.');
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    setIsProcessing(currentIsProcessing => {
      if (currentIsProcessing) {
        console.log("[InquiryModal clearWorkerAndTimeout] Setting isProcessing to false.");
        return false;
      }
      console.log("[InquiryModal clearWorkerAndTimeout] isProcessing was already false.");
      return false;
    });
  }, [setIsProcessing]);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
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
    console.log("[InquiryModal] handleExcelValidationComplete received result:", newValidationResult);

    setExcelValidationState(newValidationResult);

    if (newValidationResult.isLargeFile && !newValidationResult.error && newValidationResult.hasData && newValidationResult.headersValid) {
      if (typeof toast === 'function') {
        toast({
          title: "대용량 파일 처리 완료",
          description: `${newValidationResult.fileSize ? (newValidationResult.fileSize / 1024 / 1024).toFixed(1) : 'N/A'}MB 파일 (${newValidationResult.totalDataRows || 0} 행) 처리가 완료되었습니다. 미리보기를 확인하고 제출하세요.`,
        });
      }
    } else if (!newValidationResult.error && newValidationResult.hasData && newValidationResult.headersValid) {
      if (typeof toast === 'function') {
        toast({
          title: "File Valid & Ready",
          description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
        });
      }
    }
    // Do not call clearWorkerAndTimeout here, it's called by the worker message/error/timeout handlers
  }, [toast, setExcelValidationState]);


  useEffect(() => {
    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}`);
    
    let localWorker: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
      console.log("[InquiryModal useEffect_uploadedFile] Condition MET: File status is 'success'. Starting worker for:", uploadedFile.name);
      
      // Ensure any PREVIOUS worker/timeout specific to an old file is cleaned up
      // This is more of a safeguard; primary cleanup is in the return function of this useEffect or clearWorkerAndTimeout
      if (workerRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Terminating PREVIOUS worker (ref) before new one.');
        workerRef.current.terminate();
      }
      if (processingTimeoutRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Clearing PREVIOUS timeout (ref) before new one.');
        clearTimeout(processingTimeoutRef.current);
      }
      // Reset refs before assigning new ones
      workerRef.current = null;
      processingTimeoutRef.current = null;
      
      setExcelValidationState(null);
      setIsProcessing(true);
      console.log("[InquiryModal useEffect_uploadedFile] Just called setIsProcessing(true).");

      if (uploadedFile.file.size > (5 * 1024 * 1024) && typeof toast === 'function') { // 5MB
        toast({
          title: "대용량 파일 처리 중",
          description: `파일 크기가 ${(uploadedFile.file.size / 1024 / 1024).toFixed(1)}MB 입니다. 처리에 시간이 걸릴 수 있습니다.`,
          duration: 5000,
        });
      }
      
      try {
        console.log("[InquiryModal useEffect_uploadedFile] Attempting to create new Worker.");
        localWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = localWorker;
        console.log("[InquiryModal useEffect_uploadedFile] New worker CREATED and assigned to workerRef:", localWorker);

        localWorker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
          console.log('[InquiryModal useEffect_uploadedFile] Worker ONMESSAGE. Current workerRef:', workerRef.current, 'Message from worker:', localWorker, 'Data:', event.data);
          if (workerRef.current === localWorker) { // Ensure it's the current worker
            handleExcelValidationComplete(event.data);
            clearWorkerAndTimeout();
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Message from STALE worker ignored:', localWorker);
            localWorker?.terminate(); // Terminate the stale worker that sent the message
          }
        };

        localWorker.onerror = (err) => {
          console.error('[InquiryModal useEffect_uploadedFile] Worker ONERROR. Current workerRef:', workerRef.current, 'Error from worker:', localWorker, 'Error:', err);
          if (workerRef.current === localWorker) {
            handleExcelValidationComplete({
              error: `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`,
              previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
              fileSize: uploadedFile.file.size,
              isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024),
            });
            clearWorkerAndTimeout();
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Error from STALE worker ignored:', localWorker);
            localWorker?.terminate();
          }
        };

        localTimeoutId = setTimeout(() => {
          console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT. Current workerRef:', workerRef.current, 'Timed out worker:', localWorker);
          if (workerRef.current === localWorker) {
            handleExcelValidationComplete({
              error: 'File parsing timed out. The file might be too large or complex.',
              previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
              fileSize: uploadedFile.file.size,
              isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024),
            });
            clearWorkerAndTimeout();
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Timeout for STALE worker ignored:', localWorker);
          }
        }, PROCESSING_TIMEOUT_MS);
        processingTimeoutRef.current = localTimeoutId;
        console.log('[InquiryModal useEffect_uploadedFile] Timeout SET for current worker:', localTimeoutId);

        console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker:', localWorker, 'for file:', uploadedFile.file.name);
        localWorker.postMessage({ file: uploadedFile.file });

      } catch (workerError: any) {
        console.error("[InquiryModal useEffect_uploadedFile] Error CREATING Worker instance or POSTING to worker:", workerError);
        // This catch block handles errors from `new Worker(...)` or `localWorker.postMessage(...)`
        setExcelValidationState({
          error: `Failed to initialize file processing: ${workerError.message || 'Unknown worker error.'}`,
          previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: uploadedFile.file.size,
          isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024),
        });
        clearWorkerAndTimeout(); // This will set isProcessing to false
      }

    } else if (uploadedFile && uploadedFile.status === 'uploading') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for 'success'.`);
      // Clear previous validation for a new upload, but don't affect isProcessing or worker yet.
      setExcelValidationState(null);
    } else { // uploadedFile is null or status is 'error' from dropzone
      console.log(`[InquiryModal useEffect_uploadedFile] File removed or initial error. Status: ${uploadedFile?.status}. Cleaning up.`);
      clearWorkerAndTimeout(); // Ensure everything is reset
      if (uploadedFile && uploadedFile.status === 'error') {
        setExcelValidationState({
          error: uploadedFile.errorMessage || "Error during file selection.",
          hasData: false, headersValid: false, totalDataRows: 0, previewData: null, fileSize: uploadedFile.size
        });
      } else {
        setExcelValidationState(null);
      }
    }
    
    // Cleanup function for this specific useEffect run
    return () => {
      console.log('[InquiryModal useEffect_uploadedFile] CLEANUP. Terminating localWorker (if it was this run\'s worker):', localWorker, 'Clearing localTimeoutId:', localTimeoutId);
      // Only terminate the worker created in *this* effect instance if it's still around and matches workerRef.current
      // This is tricky because localWorker is in closure. The main `clearWorkerAndTimeout` should be robust.
      // A simpler cleanup might be to rely on the next effect run to clear `workerRef.current`.
      // However, if this effect is the last one (e.g. component unmount), `localWorker` should be terminated.
      if (localWorker && workerRef.current === localWorker) { // Check if it's still the "active" one
         // It might have been terminated by onmessage/onerror already.
         // localWorker.terminate(); // Redundant if clearWorkerAndTimeout was called.
      }
      if (localTimeoutId && processingTimeoutRef.current === localTimeoutId) {
        // clearTimeout(localTimeoutId); // Redundant if clearWorkerAndTimeout was called.
      }
    };

  }, [uploadedFile, handleExcelValidationComplete, toast, clearWorkerAndTimeout, setIsProcessing, setExcelValidationState]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile ? { ...newFile, file: newFile.file?.name } : null);
    setUploadedFile(newFile);
    // If file is removed or there's an immediate error from FileUploadZone, reset states.
    // The useEffect above will handle starting the worker if status becomes 'success'.
    if (!newFile || newFile.status !== 'success') {
        // If newFile is null (removed) or has an error status from dropzone,
        // we should ensure isProcessing is false and validation is cleared.
        // The useEffect above will also handle this, but being explicit here can be safer for removal.
        if (!newFile || newFile.status === 'error') {
            console.log("[InquiryModal handleFileChange] File removed or dropzone error. Calling clearWorkerAndTimeout.");
            clearWorkerAndTimeout(); // This will set isProcessing to false
            setExcelValidationState(newFile?.status === 'error' ? {
                error: newFile.errorMessage || "Error during file selection.",
                hasData: false, headersValid: false, totalDataRows: 0, previewData: null, fileSize: newFile.size
            } : null);
        }
    }
  }, [clearWorkerAndTimeout, setExcelValidationState, setUploadedFile]);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); // This will trigger the useEffect for uploadedFile to cleanup
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      clearWorkerAndTimeout(); // Final cleanup including isProcessing
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout, setExcelValidationState, setUploadedFile, setActiveTab, setIsSubmitting]);

  // Final cleanup on component unmount
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
    // Add actual validation for direct entry data here if needed
    return false;
  };

  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    console.log(`[InquiryModal] handleSubmitInquiry called for tab: ${activeTab}`);
    
    // Simulate submission delay
    await new Promise(resolve => setTimeout(resolve, 1000)); 

    if (activeTab === 'excel') {
      if (excelValidationState && !excelValidationState.error && excelValidationState.hasData && excelValidationState.headersValid) {
        if (typeof toast === 'function') {
          toast({
            title: "Inquiry Submitted (Excel)",
            description: `File "${uploadedFile?.name}" with ${excelValidationState.totalDataRows || 0} data rows has been submitted.`,
          });
        }
        handleModalOpenChange(false);
      } else {
        let description = "Cannot submit. Ensure a valid Excel file with data and correct headers is uploaded.";
         if (uploadedFile && uploadedFile.status === 'error' && uploadedFile.errorMessage) {
          description = uploadedFile.errorMessage;
        } else if (excelValidationState?.error) {
          description = excelValidationState.error;
        } else if (excelValidationState && !excelValidationState.headersValid) {
          description = "Cannot submit: The Excel file headers are invalid. Please use the template.";
        } else if (excelValidationState && !excelValidationState.hasData) {
          description = "Cannot submit: The Excel file is valid but contains no data rows.";
        }
        if (typeof toast === 'function') {
          toast({ title: "Submission Error", description, variant: "destructive" });
        }
      }
    } else if (activeTab === 'direct') {
      console.log('Submitting direct entry form...');
       if (typeof toast === 'function') {
        toast({
          title: "Inquiry Submitted (Direct)",
          description: "Your direct entry inquiry has been submitted.",
        });
      }
      handleModalOpenChange(false);
    }
    setIsSubmitting(false);
  };

  console.log("[InquiryModal] Final rendering states:", { isProcessing, uploadedFileStatus: uploadedFile?.status, excelError: excelValidationState?.error, excelHasData: excelValidationState?.hasData });

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
            <TabsTrigger value="excel" disabled={isSubmitting || (isProcessing && activeTab === 'excel') }>Excel Upload</TabsTrigger>
            <TabsTrigger value="direct" disabled={isSubmitting || (isProcessing && activeTab === 'excel') }>Direct Entry</TabsTrigger>
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
              isSubmitting ||
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

    