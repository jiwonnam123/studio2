
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
// import { useToast as uiToastHook } from '@/hooks/use-toast'; // Temporarily disabled
import { Loader2 } from 'lucide-react';

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds
const LARGE_FILE_THRESHOLD_MB = 5; // 5MB

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Global processing state for worker
  const [isSubmitting, setIsSubmitting] = useState(false); // For final submission loading state

  // const toastHookInstance = uiToastHook(); // Temporarily disabled
  // const toast = useMemo(() => { // Temporarily disabled
  //   if (toastHookInstance && typeof toastHookInstance.toast === 'function') {
  //     return toastHookInstance.toast;
  //   }
  //   console.warn("[InquiryModal] Toast function not available from useToast. Using dummy.");
  //   return (options: any) => {
  //     console.log("DUMMY TOAST (hook disabled):", options);
  //     return { id: '', dismiss: () => {}, update: () => {} };
  //   };
  // }, [toastHookInstance]); // Temporarily disabled

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null); // Track the file being processed

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
    // setIsProcessing should be handled by the calling context or after this function
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

    // if (newValidationResult.isValid && newValidationResult.hasData) { // Temporarily disabled
    //   toast({
    //     title: "File Valid & Ready",
    //     description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview available.`,
    //   });
    // } else if (newValidationResult.error) { // Temporarily disabled
    //   toast({
    //     title: "File Processing Issue",
    //     description: newValidationResult.error || "An error occurred during file processing.",
    //     variant: "destructive",
    //   });
    // } else if (newValidationResult.isLargeFile && newValidationResult.isValid) { // Temporarily disabled
    //    toast({
    //         title: "Large File Processed",
    //         description: `Successfully processed a large file (${newValidationResult.fileSize ? (newValidationResult.fileSize / 1024 / 1024).toFixed(1) : 'N/A'}MB).`,
    //         variant: "default",
    //         duration: 5000,
    //     });
    // }
  }, [/* toast */]); // Temporarily disabled

  useEffect(() => {
    const uploadedFileStatus = uploadedFile?.status;
    const currentFileObject = uploadedFile?.file;
    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFileStatus}, currentFileObject name: ${currentFileObject?.name}, isProcessing: ${isProcessing}`);

    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (uploadedFileStatus === 'success' && currentFileObject && !isProcessing) {
      console.log(`[InquiryModal useEffect_uploadedFile] Condition MET: File status 'success', file object exists, and not currently processing. Starting worker for: ${currentFileObject.name}.`);
      
      // Clear any previous worker/timeout *before* starting a new one
      if (workerRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Terminating PREVIOUS workerRef.current');
        workerRef.current.terminate();
      }
      if (timeoutRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Clearing PREVIOUS timeoutRef.current');
        clearTimeout(timeoutRef.current);
      }
      workerRef.current = null; // Ensure refs are null before new assignment
      timeoutRef.current = null;

      setExcelValidationState(null); // Reset previous validation
      setIsProcessing(true);
      console.log(`[InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE.`);
      currentFileRef.current = currentFileObject;

      // if (currentFileObject.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024) { // Temporarily disabled
      //   toast({
      //       title: "Processing Large File",
      //       description: "The uploaded Excel file is large and may take some time to process. Please wait.",
      //       duration: 5000,
      //   });
      // }
      
      try {
        console.log('[InquiryModal useEffect_uploadedFile] Attempting to create new Worker.');
        localWorkerInstance = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
        console.log('[InquiryModal useEffect_uploadedFile] New worker CREATED and assigned to localWorkerInstance:', localWorkerInstance);
        workerRef.current = localWorkerInstance; // Assign to ref immediately

        localWorkerInstance.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
          if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === currentFileObject.name) {
            console.log('[InquiryModal useEffect_uploadedFile] Worker ONMESSAGE. Data:', event.data);
            handleExcelValidationComplete(event.data);
            setIsProcessing(false); // Processing finished
            clearWorkerAndTimeout(); // Clear refs after processing
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker ONMESSAGE from STALE worker/file. IGNORED. Current worker:', workerRef.current, 'Msg from:', localWorkerInstance, 'Current file:', currentFileRef.current?.name, 'File from msg event related to:', currentFileObject.name);
          }
        };

        localWorkerInstance.onerror = (err) => {
           if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === currentFileObject.name) {
            console.error('[InquiryModal useEffect_uploadedFile] Worker ONERROR. Error:', err);
            handleExcelValidationComplete({ success: false, error: `Worker error: ${err.message || 'Unknown.'}`, fileSize: currentFileObject?.size });
            setIsProcessing(false); // Processing finished with error
            clearWorkerAndTimeout();
          } else {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker ONERROR from STALE worker/file. IGNORED.');
          }
        };
        
        console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker with file:', currentFileObject.name);
        localWorkerInstance.postMessage({ file: currentFileObject });

        localTimeoutId = setTimeout(() => {
          if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === currentFileObject.name) {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT.');
            handleExcelValidationComplete({
              success: false,
              error: 'Excel 파일 처리 시간이 초과되었습니다. (30초)',
              fileSize: currentFileObject?.size,
              isLargeFile: currentFileObject ? currentFileObject.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024 : undefined,
            });
            setIsProcessing(false); // Processing finished with timeout
            clearWorkerAndTimeout();
          } else {
             console.log('[InquiryModal useEffect_uploadedFile] Timeout for STALE worker/file ignored.');
          }
        }, PROCESSING_TIMEOUT_MS);
        timeoutRef.current = localTimeoutId;
        console.log('[InquiryModal useEffect_uploadedFile] Timeout SET. ID:', localTimeoutId);

      } catch (workerError: any) {
        console.error('[InquiryModal useEffect_uploadedFile] Failed to create or setup worker:', workerError);
        handleExcelValidationComplete({ success: false, error: `File processing environment error: ${workerError.message}`, fileSize: currentFileObject?.size });
        setIsProcessing(false);
        clearWorkerAndTimeout(); 
      }
    } else if (uploadedFileStatus === 'uploading') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for 'success'. Previous validation state cleared.`);
      setExcelValidationState(null); // Clear validation while new file is "uploading"
      // isProcessing should ideally be false here or handled carefully.
    } else if (!uploadedFile || uploadedFileStatus === 'error') {
      console.log(`[InquiryModal useEffect_uploadedFile] No valid file or file removed/errored from dropzone. Status: ${uploadedFileStatus}. Cleaning up.`);
      clearWorkerAndTimeout();
      setExcelValidationState(uploadedFile?.errorMessage ? { error: uploadedFile.errorMessage, isValid: false, hasData: false } : null);
      setIsProcessing(false); // Ensure processing is false if file is removed or errored early
      currentFileRef.current = null;
    }

    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Attempting to terminate localWorkerInstance: ${localWorkerInstance} and clear localTimeoutId: ${localTimeoutId}`);
      localWorkerInstance?.terminate();
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
    };
  }, [uploadedFile, isProcessing, handleExcelValidationComplete, clearWorkerAndTimeout /*, toast (temporarily disabled) */]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile);
    if (!newFile) { // File removed
        console.log("[InquiryModal handleFileChange] File removed. Clearing validation and processing states.");
        setExcelValidationState(null);
        setIsProcessing(false);
        clearWorkerAndTimeout(); // Ensure cleanup
        currentFileRef.current = null;
    } else if (newFile.status === 'error') { // Error from FileUploadZone
        console.log("[InquiryModal handleFileChange] File error from dropzone. Setting validation error.");
        setExcelValidationState({
            error: newFile.errorMessage || "Error during file selection.",
            isValid: false,
            hasData: false,
        });
        setIsProcessing(false);
        clearWorkerAndTimeout();
        currentFileRef.current = null;
    }
    // For 'uploading' or 'success', the useEffect will handle it.
  }, [clearWorkerAndTimeout]);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); // This will trigger the useEffect to cleanup
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsSubmitting(false);
      clearWorkerAndTimeout(); // Explicit cleanup on modal close
      setIsProcessing(false);
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
    console.log("[InquiryModal] handleSubmitInquiry clicked.");
    console.log("Current Tab:", activeTab);
    console.log("Uploaded File State:", uploadedFile);
    console.log("Excel Validation State:", excelValidationState);

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        setIsSubmitting(true);
        console.log("Submitting Excel Data ( simulated - fullData has ", excelValidationState.fullData.length, " rows):", excelValidationState.fullData.slice(0,2)); // Log first 2 rows of fullData
        await new Promise(resolve => setTimeout(resolve, 1500));
        // toast({ // Temporarily disabled
        //   title: "Inquiry Submitted (Excel)",
        //   description: `Successfully submitted ${excelValidationState.totalDataRows} rows from Excel.`,
        // });
        console.log(`Inquiry Submitted (Excel) - ${excelValidationState.totalDataRows} rows`);
        setIsSubmitting(false);
        handleModalOpenChange(false);
      } else {
        // toast({ // Temporarily disabled
        //   title: "Cannot Submit",
        //   description: excelValidationState?.error || "Please upload a valid Excel file with data.",
        //   variant: "destructive",
        // });
        console.error("Cannot Submit Excel:", excelValidationState?.error || "Invalid/No data");
      }
    } else if (activeTab === 'direct') {
      setIsSubmitting(true);
      console.log("Submitting Direct Entry Data (Not Implemented)");
      await new Promise(resolve => setTimeout(resolve, 1000));
      // toast({ // Temporarily disabled
      //   title: "Inquiry Submitted (Direct Entry)",
      //   description: "Direct entry data submitted (simulated).",
      // });
      console.log("Inquiry Submitted (Direct Entry) - simulated");
      setIsSubmitting(false);
      handleModalOpenChange(false);
    }
  }, [activeTab, uploadedFile, excelValidationState, handleModalOpenChange /*, toast (temporarily disabled) */]);
  
  console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);

  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true;
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData) {
      return true;
    }
    return false;
  };

  const isDirectSubmitDisabled = () => {
    return isSubmitting || isProcessing; // Placeholder
  };
  
  const finalRenderStatesForExcelTab = {
      isProcessingGlobal: isProcessing, // Pass the modal's processing state
      uploadedFileState: uploadedFile,
      excelValidationState: excelValidationState,
  };
  console.log("[InquiryModal] Final rendering states for ExcelUploadTab:", finalRenderStatesForExcelTab);


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
            </div>
          )}
          {!isProcessing && excelValidationState && activeTab === 'excel' && (
            <div className="text-xs text-muted-foreground pt-2 space-y-0.5 text-center">
              {excelValidationState.fileSize !== undefined && ( <p>파일 크기: {(excelValidationState.fileSize / 1024).toFixed(1)}KB</p> )}
              {excelValidationState.processingTime !== undefined && ( <p>처리 시간: {excelValidationState.processingTime.toFixed(0)}ms</p> )}
              {excelValidationState.totalDataRows !== undefined && excelValidationState.headersValid && ( <p>총 데이터 행: {excelValidationState.totalDataRows}</p> )}
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
                isProcessingGlobal={isProcessing} // Pass the modal's processing state
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
