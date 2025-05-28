
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
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds
const LARGE_FILE_WARNING_THRESHOLD_MB = 5 * 1024 * 1024; // 5MB

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // This should be stable as useToast hook itself should be stable
  const { toast } = uiToastHook(); 

  const clearWorkerAndTimeout = useCallback(() => {
    console.log("[InquiryModal] clearWorkerAndTimeout called. Current workerRef:", workerRef.current, "Current timeoutRef:", processingTimeoutRef.current);
    if (workerRef.current) {
      console.log("[InquiryModal] Terminating worker via workerRef.current:", workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (processingTimeoutRef.current) {
      console.log("[InquiryModal] Clearing timeout via processingTimeoutRef.current:", processingTimeoutRef.current);
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    // Ensure isProcessing is set to false when explicitly clearing.
    // setIsProcessing might be called multiple times, but that's okay.
    if (isProcessing) { // Only call if it was true, to avoid unnecessary re-renders
        console.log("[InquiryModal clearWorkerAndTimeout] Setting isProcessing to false");
        setIsProcessing(false);
    }
  }, [isProcessing, setIsProcessing]); // Added setIsProcessing, though it's stable

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

    setExcelValidationState(currentValidationState => {
      if (JSON.stringify(currentValidationState) !== JSON.stringify(newValidationResult)) {
        return newValidationResult;
      }
      return currentValidationState;
    });

    if (!newValidationResult.error && newValidationResult.dataExistsInSheet && newValidationResult.headersValid) {
       if (newValidationResult.isLargeFile) {
        toast({
            title: "대용량 파일 처리 완료",
            description: `${newValidationResult.fileSize ? (newValidationResult.fileSize / 1024 / 1024).toFixed(1) : 'Large'}MB 파일 (${newValidationResult.totalDataRows || 0} 행) 처리가 완료되었습니다. 미리보기를 확인하고 제출하세요.`,
        });
       } else {
        toast({
            title: "File Valid & Ready",
            description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
        });
       }
    }
    // clearWorkerAndTimeout will be called by the worker's onmessage/onerror/timeout handlers right after this
  }, [toast]);


  // Effect to manage worker based on uploadedFile state
  useEffect(() => {
    console.log('[InquiryModal useEffect_uploadedFile] START. uploadedFile:', uploadedFile, 'isProcessing:', isProcessing);
    
    // These are scoped to this specific effect execution
    let localWorker: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
      console.log("[InquiryModal useEffect_uploadedFile] Condition MET: File status is 'success'. Starting worker for:", uploadedFile.name);
      
      // IMPORTANT: Clear any potentially existing worker/timeout before starting a new one.
      // This handles cases where `uploadedFile` might change rapidly.
      if (workerRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Terminating PREVIOUS worker (workerRef.current) before starting new one.');
        workerRef.current.terminate();
      }
      if (processingTimeoutRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Clearing PREVIOUS timeout (processingTimeoutRef.current) before starting new one.');
        clearTimeout(processingTimeoutRef.current);
      }
      // Reset refs immediately
      workerRef.current = null;
      processingTimeoutRef.current = null;

      setExcelValidationState(null); // Reset previous validation
      setIsProcessing(true); // Set global processing state
      console.log("[InquiryModal useEffect_uploadedFile] Set isProcessing to TRUE.");


      if (uploadedFile.file.size > LARGE_FILE_WARNING_THRESHOLD_MB) {
        toast({
          title: "대용량 파일 처리 중",
          description: `파일 크기가 ${(uploadedFile.file.size / 1024 / 1024).toFixed(1)}MB 입니다. 처리에 시간이 걸릴 수 있습니다.`,
          duration: 5000,
        });
      }
      
      console.log("[InquiryModal useEffect_uploadedFile] Attempting to create new Worker.");
      try {
        localWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = localWorker; 
        console.log('[InquiryModal useEffect_uploadedFile] New worker CREATED and assigned to workerRef:', localWorker);

        localWorker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
          console.log('[InquiryModal useEffect_uploadedFile] Worker ONMESSAGE. Message from worker instance:', localWorker, 'Data:', event.data);
          if (workerRef.current === localWorker) { 
            console.log('[InquiryModal useEffect_uploadedFile] Worker message received for CURRENT worker instance.');
            handleExcelValidationComplete(event.data);
            clearWorkerAndTimeout(); 
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Message from STALE worker ignored. Current workerRef:', workerRef.current, 'Message from:', localWorker);
            (event.currentTarget as Worker)?.terminate(); // Terminate the stale worker instance
          }
        };

        localWorker.onerror = (err) => {
          console.error('[InquiryModal useEffect_uploadedFile] Worker ONERROR. Error from worker instance:', localWorker, 'Error:', err);
          if (workerRef.current === localWorker && uploadedFile?.file) {
            console.error('[InquiryModal useEffect_uploadedFile] Worker error for CURRENT worker instance.');
            handleExcelValidationComplete({
              error: `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`,
              previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
              fileSize: uploadedFile.file.size,
              isLargeFile: uploadedFile.file.size > LARGE_FILE_WARNING_THRESHOLD_MB,
            });
            clearWorkerAndTimeout(); 
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Error from STALE worker ignored. Current workerRef:', workerRef.current, 'Error from:', localWorker);
            (err.currentTarget as Worker)?.terminate?.();
          }
        };

        localTimeoutId = setTimeout(() => {
          console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for worker instance:', localWorker);
          if (workerRef.current === localWorker && uploadedFile?.file) {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker processing timed out for CURRENT worker instance file:', uploadedFile.name);
            handleExcelValidationComplete({
              error: 'File parsing timed out. The file might be too large or complex.',
              previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
              fileSize: uploadedFile.file.size,
              isLargeFile: uploadedFile.file.size > LARGE_FILE_WARNING_THRESHOLD_MB,
            });
            clearWorkerAndTimeout(); 
          } else {
             console.warn('[InquiryModal useEffect_uploadedFile] Timeout for STALE worker ignored. Current workerRef:', workerRef.current, 'Timed out worker:', localWorker);
          }
        }, PROCESSING_TIMEOUT_MS);
        processingTimeoutRef.current = localTimeoutId;
        console.log('[InquiryModal useEffect_uploadedFile] Timeout SET for current worker and assigned to processingTimeoutRef:', localTimeoutId);

        console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker instance:', localWorker, 'for file:', uploadedFile.file.name);
        localWorker.postMessage({ file: uploadedFile.file });
        console.log('[InquiryModal useEffect_uploadedFile] Message POSTED to worker instance.');

      } catch (workerError) {
        console.error("[InquiryModal useEffect_uploadedFile] Error CREATING worker:", workerError);
        handleExcelValidationComplete({
          error: `Failed to initialize file processing worker: ${(workerError as Error).message || 'Unknown worker creation error.'}`,
          previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: uploadedFile.file.size,
          isLargeFile: uploadedFile.file.size > LARGE_FILE_WARNING_THRESHOLD_MB,
        });
        clearWorkerAndTimeout();
      }

    } else if (uploadedFile && (uploadedFile.status === 'uploading' || uploadedFile.status === 'error')) {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "${uploadedFile.status}". Clearing worker/timeout. Error from dropzone:`, uploadedFile.errorMessage);
      clearWorkerAndTimeout(); // This will set isProcessing to false
      if (uploadedFile.status === 'error') {
        setExcelValidationState({
          error: uploadedFile.errorMessage || "File upload failed at dropzone.",
          hasData: false, headersValid: false, totalDataRows: 0, previewData: null,
          fileSize: uploadedFile.size,
          isLargeFile: uploadedFile.size > LARGE_FILE_WARNING_THRESHOLD_MB,
        });
      } else { // 'uploading'
         setExcelValidationState(null); 
      }
    } else { // uploadedFile is null (e.g., file removed or initial state)
      console.log('[InquiryModal useEffect_uploadedFile] No valid file or file removed. Cleaning up states.');
      clearWorkerAndTimeout(); // This will set isProcessing to false
      setExcelValidationState(null);
    }

    return () => {
      console.log('[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Local worker:', localWorker, 'Local timeoutId:', localTimeoutId);
      // Terminate the worker created in *this specific execution* of the useEffect
      if (localWorker) {
        console.log('[InquiryModal useEffect_uploadedFile CLEANUP] Terminating localWorker instance:', localWorker);
        localWorker.terminate();
      }
      if (localTimeoutId) {
        console.log('[InquiryModal useEffect_uploadedFile CLEANUP] Clearing localTimeoutId:', localTimeoutId);
        clearTimeout(localTimeoutId);
      }
    };
  }, [uploadedFile, handleExcelValidationComplete, toast, clearWorkerAndTimeout]); // Ensure all stable callbacks are listed

  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile);
    // If file is removed (newFile is null) or has an initial error from FileUploadZone,
    // the useEffect watching `uploadedFile` will handle clearing states and worker.
  }, []); 
  
  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); 
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      clearWorkerAndTimeout(); // This will also set isProcessing to false.
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout]);
  
  // Effect for final cleanup when modal component unmounts
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
    if (isSubmitting || isProcessing) return true; // Consider if direct entry should also be blocked by isProcessing
    return false;
  };

  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    console.log(`[InquiryModal] handleSubmitInquiry called for tab: ${activeTab}`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate submission

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
      // TODO: Implement direct entry submission logic
      console.log('Submitting direct entry form...');
      toast({
        title: "Inquiry Submitted (Direct)",
        description: "Your direct entry inquiry has been submitted.",
      });
      handleModalOpenChange(false);
    }
    setIsSubmitting(false);
  };
  
  // For debugging purposes in the modal itself
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
                onFileChange={handleFileChange} // This is InquiryModal's handleFileChange
                excelValidationState={excelValidationState}
                isProcessing={isProcessing} // Pass down global processing state
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
              isSubmitting || (isProcessing && activeTab === 'excel') ||
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
