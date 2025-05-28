
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
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds for worker timeout
const LARGE_FILE_WARNING_THRESHOLD_MB = 5; // 5MB for warning toast

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Global processing state for worker

  const workerRef = useRef<Worker | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearWorkerAndTimeout = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    setIsProcessing(false); // Ensure processing state is reset
  }, []);

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

    setExcelValidationState(newValidationResult);

    if (!result.error && result.dataExistsInSheet) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${result.totalDataRows || 0} data row(s). Preview below. All rows will be processed upon submission.`,
      });
    } else if (result.isLargeFile && !result.error && result.dataExistsInSheet) { // This condition might be redundant due to above, but specific for large files
        toast({
          title: "대용량 파일 처리 완료",
          description: `${result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(1) : 'Large'}MB 파일 (${result.totalDataRows || 0} 행) 처리가 완료되었습니다.`,
        });
    }
    // Error toasts are typically handled by ExcelUploadTab or directly based on newValidationResult.error
  }, [toast]);

  useEffect(() => {
    if (uploadedFile && uploadedFile.status === 'success' && uploadedFile.file) {
      setIsProcessing(true);
      setExcelValidationState(null); // Clear previous validation state
      clearWorkerAndTimeout(); // Clear any existing worker or timeout

      const currentFile = uploadedFile.file;

      if (currentFile.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024)) {
        toast({
          title: "대용량 파일 처리 중",
          description: `파일 크기가 ${(currentFile.size / 1024 / 1024).toFixed(1)}MB 입니다. 처리에 다소 시간이 걸릴 수 있습니다.`,
          variant: "default",
          duration: 5000,
        });
      }
      
      const newWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = newWorker;

      newWorker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
        if (workerRef.current === newWorker) { // Process only if it's the current worker
          handleExcelValidationComplete(event.data);
          clearWorkerAndTimeout();
        } else {
          newWorker.terminate(); // Stale worker, terminate it
        }
      };

      newWorker.onerror = (err) => {
        if (workerRef.current === newWorker) {
          console.error("InquiryModal: Worker error:", err);
          handleExcelValidationComplete({
            error: `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`,
            previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: currentFile.size,
            isLargeFile: currentFile.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024),
          });
          clearWorkerAndTimeout();
        } else {
           newWorker.terminate(); // Stale worker, terminate it
        }
      };

      processingTimeoutRef.current = setTimeout(() => {
        if (workerRef.current === newWorker) {
          console.warn("InquiryModal: Worker processing timed out.");
          handleExcelValidationComplete({
            error: 'File parsing timed out. The file might be too large or complex.',
            previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: currentFile.size,
            isLargeFile: currentFile.size > (LARGE_FILE_WARNING_THRESHOLD_MB * 1024 * 1024),
          });
          clearWorkerAndTimeout();
        } else {
            newWorker.terminate(); // Stale worker, terminate it
        }
      }, PROCESSING_TIMEOUT_MS);

      newWorker.postMessage({ file: currentFile });

    } else if (!uploadedFile) { // File removed or initial state
        clearWorkerAndTimeout();
        setExcelValidationState(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFile, handleExcelValidationComplete, clearWorkerAndTimeout]); // Added clearWorkerAndTimeout to dependencies

  const handleFileChange = useCallback((newUploadedFile: UploadedFile | null) => {
    setUploadedFile(newUploadedFile);
    if (!newUploadedFile || newUploadedFile.status !== 'success') {
      setExcelValidationState(null); // Reset validation if file removed or initial error in FileUploadZone
      clearWorkerAndTimeout(); // Also clear worker if file is removed or had an initial error
    }
    // Worker processing will be triggered by the useEffect listening to 'uploadedFile'
  }, [clearWorkerAndTimeout]);

  const handleSubmitInquiry = async () => {
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (activeTab === 'excel') {
      if (excelValidationState && !excelValidationState.error && excelValidationState.hasData) {
        toast({
          title: "Inquiry Submitted (Excel)",
          description: `File "${uploadedFile?.name}" with ${excelValidationState.totalDataRows || 0} data rows has been submitted.`,
        });
        handleModalOpenChange(false); // Close and reset
      } else {
        let description = "Cannot submit. Please upload a valid Excel file with data.";
        if (uploadedFile && uploadedFile.status === 'error' && uploadedFile.errorMessage) {
          description = uploadedFile.errorMessage;
        } else if (excelValidationState?.error) {
          description = excelValidationState.error;
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
      handleModalOpenChange(false); // Close and reset
    }
    setIsSubmitting(false);
  };

  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setUploadedFile(null);
      setExcelValidationState(null);
      clearWorkerAndTimeout();
      setActiveTab('excel'); // Reset to default tab
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout]);

  useEffect(() => {
    // Cleanup worker and timeout when the modal is unmounted or closed
    return () => {
      clearWorkerAndTimeout();
    };
  }, [clearWorkerAndTimeout]);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    if (!uploadedFile || uploadedFile.status !== 'success') return true;
    if (!excelValidationState || excelValidationState.error !== null || !excelValidationState.hasData) return true;
    return false;
  };

  const isDirectEntrySubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col">
        <DialogHeader className="p-6 pb-2 text-center sm:text-center">
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
            <TabsTrigger value="excel" disabled={isProcessing}>Excel Upload</TabsTrigger>
            <TabsTrigger value="direct" disabled={isProcessing}>Direct Entry</TabsTrigger>
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
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Inquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    