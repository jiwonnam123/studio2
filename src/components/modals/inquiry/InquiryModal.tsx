
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
import { SubmittedInquiry, SubmittedInquiryDataRow } from '@/types';
// import { useToast as useActualToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase'; 
import { collection, addDoc, serverTimestamp, type DocumentData } from 'firebase/firestore'; 

const PROCESSING_TIMEOUT_MS = 5000; // 5초로 단축 (문제 빠른 감지)

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

// const uiToastHook = useActualToast; // 테스트 위해 주석 처리
const dummyToast = (options: any) => {
  console.warn("DUMMY TOAST (실제 토스트 비활성화됨):", options);
  return { id: '', dismiss: () => {}, update: () => {} };
};


export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  // const toastHookInstance = uiToastHook(); // 주석 처리 (테스트 목적)
  // const toast = toastHookInstance?.toast || dummyToast; // 주석 처리 (테스트 목적)
  const toast = dummyToast; // 테스트 위해 항상 더미 사용


  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null);
  const directEntryTabRef = useRef<DirectEntryTabHandles>(null);

  const { user } = useAuth();

  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[InquiryModal] clearWorkerAndTimeout called.');
    if (workerRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Terminating active worker:', workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (timeoutRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] Clearing active timeout:', timeoutRef.current);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // setIsProcessing(false) 호출은 각 워커 작업 완료/오류/타임아웃 핸들러에서 명시적으로 수행
  }, []);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success,
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

    // if (newValidationResult.isValid && newValidationResult.hasData) { // 주석 처리 (테스트 목적)
    //   toast({
    //     title: "File Valid & Ready",
    //     description: `Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s).`,
    //   });
    // } else if (newValidationResult.isLargeFile && !newValidationResult.error) {
    //    toast({
    //     title: "Large File Processed",
    //     description: `Successfully processed a large file (${(newValidationResult.fileSize || 0 / (1024*1024)).toFixed(1)}MB). Preview might be limited.`,
    //   });
    // }
  }, [/* toast */]); 

  const createExcelWorker = useCallback((): Worker | null => {
    try {
      if (typeof Worker === 'undefined') {
        console.error('[InquiryModal createExcelWorker] Worker not supported.');
         handleExcelValidationComplete({
            type: 'result', success: false, error: 'Web Workers are not supported in your browser.',
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: currentFileRef.current?.size || 0, 
            isLargeFile: (currentFileRef.current?.size || 0) > 5 * 1024 * 1024,
          });
        return null;
      }
      
      const worker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[InquiryModal createExcelWorker] Worker CREATED successfully:', worker);
      return worker;
    } catch (error) {
      console.error('[InquiryModal createExcelWorker] Worker creation failed:', error);
      handleExcelValidationComplete({
        type: 'result', success: false, error: 'Excel processing environment could not be initialized.',
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: currentFileRef.current?.size || 0, 
        isLargeFile: (currentFileRef.current?.size || 0) > 5 * 1024 * 1024,
      });
      return null;
    }
  }, [handleExcelValidationComplete]);

  const setupWorkerHandlers = useCallback((worker: Worker, fileForWorker: File) => {
    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      if (currentFileRef.current !== fileForWorker) {
        console.warn('[InquiryModal setupWorkerHandlers] Received message from STALE worker or for a different file. IGNORED.');
        worker.terminate(); // 오래된 워커 종료
        if (workerRef.current === worker) workerRef.current = null;
        return;
      }
      if (event.data.type === 'progress') {
        console.log(`[InquiryModal setupWorkerHandlers] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
        return;
      }
      console.log('[InquiryModal setupWorkerHandlers] Worker ONMESSAGE. Data:', event.data);
      handleExcelValidationComplete(event.data);
      setIsProcessing(false);
      console.log('[InquiryModal setupWorkerHandlers ONMESSAGE] Setting isProcessing to FALSE.');
      clearWorkerAndTimeout(); // 현재 워커와 타임아웃 정리
    };

    worker.onerror = (errorEvent: ErrorEvent) => {
       if (currentFileRef.current !== fileForWorker) {
        console.warn('[InquiryModal setupWorkerHandlers] Received error from STALE worker or for a different file. IGNORED.');
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        return;
      }
      console.error('[InquiryModal setupWorkerHandlers] Worker ONERROR. ErrorEvent:', errorEvent);
      handleExcelValidationComplete({
        type: 'result', success: false, error: `Worker error: ${errorEvent.message || 'Unknown worker error.'}`,
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: fileForWorker.size, isLargeFile: fileForWorker.size > (5 * 1024 * 1024)
      });
      setIsProcessing(false);
      console.log('[InquiryModal setupWorkerHandlers ONERROR] Setting isProcessing to FALSE.');
      clearWorkerAndTimeout();
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);


  useEffect(() => {
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;
    
    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}`);

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
        if (isProcessing) {
            console.log('[InquiryModal useEffect_uploadedFile] Already processing. Skipping new worker start.');
            return;
        }
        if (workerRef.current) { // 이미 다른 워커가 실행중이면 (이론상 발생하기 어려움)
            console.warn('[InquiryModal useEffect_uploadedFile] Existing worker found. Terminating it before starting new one.');
            clearWorkerAndTimeout();
        }

        console.log(`[InquiryModal useEffect_uploadedFile] Condition MET: File status is 'success' & not processing. Starting worker for:`, uploadedFile.name);
        currentFileRef.current = uploadedFile.file;
        
        setExcelValidationState(null);
        setIsProcessing(true);
        console.log('[InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE.');

        localWorkerInstance = createExcelWorker();
        if (!localWorkerInstance) {
            setIsProcessing(false); // 워커 생성 실패 시 isProcessing 복구
            console.log('[InquiryModal useEffect_uploadedFile] Worker creation FAILED. isProcessing set to FALSE.');
            return; 
        }
        
        workerRef.current = localWorkerInstance; // 새 워커 참조 업데이트
        setupWorkerHandlers(localWorkerInstance, uploadedFile.file);

        console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker with file:', uploadedFile.file.name);
        localWorkerInstance.postMessage({ file: uploadedFile.file } as WorkerParseRequest);

        localTimeoutId = setTimeout(() => {
            if (workerRef.current === localWorkerInstance && currentFileRef.current === uploadedFile.file) {
                console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for worker:', localWorkerInstance, 'File:', uploadedFile.file.name);
                handleExcelValidationComplete({
                    type: 'result', success: false, error: `Excel file processing timed out (${PROCESSING_TIMEOUT_MS / 1000} seconds).`,
                    previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                    fileSize: uploadedFile.file.size, isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024)
                });
                setIsProcessing(false);
                console.log('[InquiryModal useEffect_uploadedFile TIMEOUT] Setting isProcessing to FALSE.');
                clearWorkerAndTimeout();
            } else {
                console.log('[InquiryModal useEffect_uploadedFile] Timeout for STALE or MISMATCHED worker/file. IGNORED worker:', localWorkerInstance, 'Current workerRef:', workerRef.current);
            }
        }, PROCESSING_TIMEOUT_MS);
        timeoutRef.current = localTimeoutId;

    } else if (uploadedFile && uploadedFile.status === 'uploading') {
        console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for 'success'. Previous validation state cleared.`);
        setExcelValidationState(null); // 'uploading' 상태에서는 이전 결과 지움
    } else { // No valid file (null, or status 'error' from dropzone)
        console.log(`[InquiryModal useEffect_uploadedFile] No valid file or file removed/error. Status: ${uploadedFile?.status}. Cleaning up.`);
        if (workerRef.current || timeoutRef.current) { // 불필요한 정리 방지
          clearWorkerAndTimeout();
        }
        setIsProcessing(false); // 확실하게 false로
        if (uploadedFile?.status === 'error') {
            setExcelValidationState({ error: uploadedFile.errorMessage || "File upload failed.", isValid: false, hasData: false });
        } else if (!uploadedFile) {
            setExcelValidationState(null);
        }
    }

    return () => {
      // This cleanup runs when 'uploadedFile' changes OR component unmounts.
      // We want to ensure that only the worker/timeout specific to THIS effect run is cleaned.
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker: ${localWorkerInstance} Clearing localTimeoutId: ${localTimeoutId}`);
      if (localWorkerInstance) {
        localWorkerInstance.terminate();
      }
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
    };
  }, [uploadedFile, createExcelWorker, setupWorkerHandlers, handleExcelValidationComplete, clearWorkerAndTimeout /* removed isProcessing */]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile);
    // If file is removed, or if it's an error from dropzone, clear validation state immediately
    if (!newFile || newFile.status === 'error') {
        console.log("[InquiryModal handleFileChange] File removed or dropzone error. Clearing validation state and worker.");
        setExcelValidationState(null);
        setIsProcessing(false); // Ensure processing stops
        clearWorkerAndTimeout(); // Clean up any existing worker/timeout
    }
  }, [clearWorkerAndTimeout]);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}.`);
    if (typeof console.trace === 'function' && !isOpen) {
        // console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); 
      setExcelValidationState(null);
      setIsProcessing(false); 
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
      // toast({ title: "Authentication Error", description: "You must be logged in to submit an inquiry.", variant: "destructive" }); // 주석 처리 (테스트 목적)
      console.warn("User not authenticated for submission");
      return;
    }
    setIsSubmitting(true); 

    let dataToFormat: string[][] = [];
    let sourceForDB: 'excel' | 'direct' = activeTab;
    let fileNameForDB: string | undefined = undefined;

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        dataToFormat = excelValidationState.fullData;
        fileNameForDB = uploadedFile?.name;
      } else {
        // toast({ // 주석 처리 (테스트 목적)
        //   title: "Cannot Submit",
        //   description: excelValidationState?.error || "Please upload a valid Excel file with data.",
        //   variant: "destructive",
        // });
        console.warn("Cannot submit Excel: Validation failed or no data", excelValidationState);
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      const gridData = directEntryTabRef.current?.getGridData(); 
      if (gridData && gridData.length > 0) {
         dataToFormat = gridData;
      } else {
        // toast({ title: "No Data", description: "Please enter data in the grid to submit.", variant: "destructive" }); // 주석 처리 (테스트 목적)
        console.warn("Cannot submit Direct Entry: No data in grid");
        setIsSubmitting(false);
        return;
      }
    }

    if (dataToFormat.length === 0) {
      // toast({ title: "No Data", description: "No data to submit.", variant: "destructive" }); // 주석 처리 (테스트 목적)
      console.warn("Cannot submit: No data rows to submit");
      setIsSubmitting(false);
      return;
    }

    const dataRowsToSubmit: SubmittedInquiryDataRow[] = dataToFormat.map(row => ({
        campaignKey: row[0] || '',
        campaignName: row[1] || '',
        adidOrIdfa: row[2] || '',
        userName: row[3] || '',
        contact: row[4] || '',
        remarks: row[5] || '',
    }));


    const inquiryDoc: DocumentData = { // Use DocumentData for more flexibility initially
      userId: user.id,
      submittedAt: serverTimestamp(), 
      source: sourceForDB,
      data: dataRowsToSubmit,
    };
    
    if (fileNameForDB) {
      inquiryDoc.fileName = fileNameForDB;
    }


    try {
      console.log("[InquiryModal handleSubmitInquiry] Submitting to Firestore:", { ...inquiryDoc, submittedAt: "SERVER_TIMESTAMP" });
      await addDoc(collection(firestore, "inquiries"), inquiryDoc);
      // toast({ // 주석 처리 (테스트 목적)
      //   title: "Inquiry Submitted!",
      //   description: `Successfully submitted ${dataRowsToSubmit.length} rows.`,
      // });
      console.log(`Inquiry submitted successfully with ${dataRowsToSubmit.length} rows.`);
      handleModalOpenChange(false); 
    } catch (error: any) {
      console.error("Error submitting inquiry to Firestore:", error);
      // toast({ // 주석 처리 (테스트 목적)
      //   title: "Submission Error",
      //   description: `Could not submit inquiry: ${error.message || 'Unknown Firestore error.'}`,
      //   variant: "destructive",
      // });
      console.warn(`Submission error: ${error.message || 'Unknown Firestore error.'}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [activeTab, excelValidationState, uploadedFile?.name, user, handleModalOpenChange /*, toast (주석처리됨) */]);
  
  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true; 
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData) {
      return true;
    }
    return false;
  };

  const isDirectSubmitDisabled = () => {
    // Allow submission if not submitting/processing, and direct entry tab is active
    // Actual data check will be in handleSubmitInquiry
    return isSubmitting || isProcessing; 
  };
  
  // console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);
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
          {isProcessing && ( // Show loader if global isProcessing is true
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중... {uploadedFile?.file ? `(${(uploadedFile.file.size / 1024).toFixed(1)}KB)` : ''}
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
                onFileChange={handleFileChange} // Renamed from onFileAccepted in ExcelUploadTab's props
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

