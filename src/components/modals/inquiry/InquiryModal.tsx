
"use client";

import type React from 'react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image'; // next/image import 추가
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
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse, SubmittedInquiryDataRow } from '@/types/inquiry'; // inquiry 타입 사용
import type { SubmittedInquiry } from '@/types'; // SubmittedInquiry 타입 사용
// import { useToast } from '@/hooks/use-toast'; // 테스트를 위해 일시적으로 주석 처리
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, type DocumentData } from 'firebase/firestore';

const PROCESSING_TIMEOUT_MS = 30000; // 30초

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

// Dummy toast function for when the real one is commented out
const dummyToast = (options: any) => {
  console.warn("Toast function is currently disabled. Options:", options);
  return { id: '', dismiss: () => {}, update: (props: any) => {} };
};

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  // const toastHookInstance = useToast();
  // const toast = toastHookInstance?.toast || dummyToast; // 테스트를 위해 일시적으로 주석 처리
  const toast = dummyToast; // 테스트용 더미 토스트 사용

  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Web worker or other async processing
  const [isSubmitting, setIsSubmitting] = useState(false); // Firestore submission

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const directEntryTabRef = useRef<DirectEntryTabHandles>(null);
  const currentFileRef = useRef<File | null>(null); // Ref to store the file being processed by the current worker

  const { user } = useAuth();

  // Logging for render state
  console.log(
    `[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`
  );


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
    // setIsProcessing is now handled more directly where this function is called.
    // Avoid setting isProcessing here if it might conflict with an immediate setIsProcessing(true)
  }, []);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse, processedFile: File | null) => {
    console.log("[InquiryModal] handleExcelValidationComplete received result for file:", processedFile?.name, "Current file in ref:", currentFileRef.current?.name, "Result:", result);
    
    // Only update if the result is for the currently processed file
    if (currentFileRef.current && processedFile && currentFileRef.current.name === processedFile.name && currentFileRef.current.size === processedFile.size) {
      const newValidationResult: ExcelValidationResult = {
        isValid: result.success,
        error: result.error || null,
        hasData: result.dataExistsInSheet || false,
        previewData: result.previewData || null,
        fullData: result.fullData || null, // Ensure fullData is mapped
        totalDataRows: result.totalDataRows || 0,
        headersValid: result.headersValid || false,
        fileSize: result.fileSize,
        processingTime: result.processingTime,
        isLargeFile: result.isLargeFile,
      };
      setExcelValidationState(newValidationResult);

      if (newValidationResult.isValid && newValidationResult.hasData) {
        // toast({ // 토스트 기능 임시 주석 처리
        //   title: "파일 유효 및 준비 완료",
        //   description: `업로드된 Excel 파일이 유효하며 ${newValidationResult.totalDataRows || 0}개의 데이터 행을 포함합니다. 모든 행은 제출 시 처리됩니다.`,
        // });
        console.log(`[Toast (Disabled)] 파일 유효 및 준비 완료. ${newValidationResult.totalDataRows || 0}개 행.`);
      } else if (newValidationResult.isLargeFile && !newValidationResult.error) {
        // toast({ // 토스트 기능 임시 주석 처리
        //   title: "대용량 파일 처리 완료",
        //   description: `성공적으로 대용량 파일 (${((newValidationResult.fileSize || 0) / (1024*1024)).toFixed(1)}MB)을 처리했습니다.`,
        //   variant: "default"
        // });
        console.log(`[Toast (Disabled)] 대용량 파일 처리 완료. ${((newValidationResult.fileSize || 0) / (1024*1024)).toFixed(1)}MB.`);
      }
    } else {
      console.warn("[InquiryModal handleExcelValidationComplete] Received result for an outdated or mismatched file. Ignoring.", {processedFileName: processedFile?.name, currentFileName: currentFileRef.current?.name});
    }
  }, [/* toast dependency removed */]);

  const createExcelWorker = useCallback((): Worker | null => {
    try {
      if (typeof Worker === 'undefined') {
        console.error('[InquiryModal createExcelWorker] Web Workers are not supported in this browser.');
        // No direct call to handleExcelValidationComplete here, let the main useEffect handle it
        return null;
      }
      const workerInstance = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[InquiryModal createExcelWorker] Worker CREATED successfully:', workerInstance);
      return workerInstance;
    } catch (error) {
      console.error('[InquiryModal createExcelWorker] Worker CREATION FAILED:', error);
      return null;
    }
  }, []);

  const setupWorkerHandlers = useCallback((worker: Worker, fileToProcess: File) => {
    console.log(`[InquiryModal setupWorkerHandlers] Setting up handlers for worker processing file: ${fileToProcess.name}`);
    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      // Ensure this message is from the current worker and for the current file
      if (workerRef.current === worker && currentFileRef.current === fileToProcess) {
        console.log('[InquiryModal setupWorkerHandlers] Worker ONMESSAGE. Data:', event.data);
        if (event.data.type === 'progress') {
          console.log(`[InquiryModal handleWorkerMessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
          return;
        }
        handleExcelValidationComplete(event.data, fileToProcess);
        setIsProcessing(false);
        console.log('[InquiryModal setupWorkerHandlers ONMESSAGE] Setting isProcessing to FALSE.');
        clearWorkerAndTimeout(); // Ensure all resources are cleared
      } else {
        console.warn('[InquiryModal setupWorkerHandlers] Received message from an outdated worker or for an outdated file. Terminating this worker and ignoring message.', { workerInstance: worker, fileName: fileToProcess.name });
        worker.terminate(); // Terminate the outdated worker
      }
    };

    worker.onerror = (errorEvent: ErrorEvent) => {
      if (workerRef.current === worker && currentFileRef.current === fileToProcess) {
        console.error('[InquiryModal setupWorkerHandlers] Worker ONERROR. ErrorEvent:', errorEvent);
        handleExcelValidationComplete({
          type: 'result', success: false, error: `워커 오류: ${errorEvent.message || '알 수 없는 워커 오류입니다.'}`,
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: fileToProcess.size, isLargeFile: fileToProcess.size > (5 * 1024 * 1024)
        }, fileToProcess);
        setIsProcessing(false);
        console.log('[InquiryModal setupWorkerHandlers ONERROR] Setting isProcessing to FALSE.');
        clearWorkerAndTimeout();
      } else {
         console.warn('[InquiryModal setupWorkerHandlers] Received error from an outdated worker or for an outdated file. Terminating this worker and ignoring error.', { workerInstance: worker, fileName: fileToProcess.name });
        worker.terminate();
      }
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);


  useEffect(() => {
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;
    const fileToProcess = uploadedFile?.file; // Capture the file at the time effect runs

    console.log(`[InquiryModal useEffect_uploadedFile] START. Status: ${uploadedFile?.status}, File: ${uploadedFile?.file?.name}, isProcessing: ${isProcessing}`);

    if (uploadedFile && fileToProcess && uploadedFile.status === 'success') {
      console.log(`[InquiryModal useEffect_uploadedFile] Condition MET: File status 'success' for ${fileToProcess.name}. Current isProcessing: ${isProcessing}`);
      
      // Clear any existing worker/timeout before starting a new one
      if (workerRef.current) {
        console.log("[InquiryModal useEffect_uploadedFile] Terminating PREVIOUS workerRef:", workerRef.current);
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        console.log("[InquiryModal useEffect_uploadedFile] Clearing PREVIOUS timeoutRef:", timeoutRef.current);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setExcelValidationState(null); // Reset validation state for the new file
      setIsProcessing(true);
      console.log(`[InquiryModal useEffect_uploadedFile] Set isProcessing to TRUE for ${fileToProcess.name}`);
      currentFileRef.current = fileToProcess; // Set the current file being processed

      if (fileToProcess.size > 10 * 1024 * 1024) { // 10MB
        // toast({ // 토스트 기능 임시 주석 처리
        //   title: "대용량 파일 처리 중",
        //   description: `파일 크기가 ${(fileToProcess.size / (1024*1024)).toFixed(1)}MB입니다. 처리 시간이 오래 걸릴 수 있습니다.`,
        // });
        console.log(`[Toast (Disabled)] 대용량 파일 처리 중: ${(fileToProcess.size / (1024*1024)).toFixed(1)}MB`);
      }

      localWorkerInstance = createExcelWorker();
      if (!localWorkerInstance) {
        console.error(`[InquiryModal useEffect_uploadedFile] Failed to create worker for ${fileToProcess.name}.`);
        handleExcelValidationComplete({
            type: 'result', success: false, error: 'Excel 처리 환경을 초기화할 수 없습니다.',
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: fileToProcess.size, isLargeFile: fileToProcess.size > (5 * 1024 * 1024)
        }, fileToProcess);
        setIsProcessing(false);
        console.log(`[InquiryModal useEffect_uploadedFile] Set isProcessing to FALSE due to worker creation failure for ${fileToProcess.name}`);
        currentFileRef.current = null; 
        return; // Exit effect
      }
      
      workerRef.current = localWorkerInstance;
      setupWorkerHandlers(localWorkerInstance, fileToProcess);
      console.log(`[InquiryModal useEffect_uploadedFile] Posting message to worker for file: ${fileToProcess.name}`);
      localWorkerInstance.postMessage({ file: fileToProcess } as WorkerParseRequest);

      localTimeoutId = setTimeout(() => {
        if (workerRef.current === localWorkerInstance && currentFileRef.current === fileToProcess) {
          console.warn(`[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for file ${fileToProcess.name}. Worker:`, localWorkerInstance);
          handleExcelValidationComplete({
              type: 'result', success: false, error: `Excel 파일 처리 시간이 ${PROCESSING_TIMEOUT_MS / 1000}초를 초과했습니다.`,
              previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
              fileSize: fileToProcess.size, isLargeFile: fileToProcess.size > (5 * 1024 * 1024)
          }, fileToProcess);
          setIsProcessing(false);
          console.log(`[InquiryModal useEffect_uploadedFile] Set isProcessing to FALSE due to TIMEOUT for ${fileToProcess.name}`);
          clearWorkerAndTimeout(); // This will terminate the worker and clear refs
        } else {
            console.log('[InquiryModal useEffect_uploadedFile] Timeout occurred for an outdated worker/file. Ignoring.');
        }
      }, PROCESSING_TIMEOUT_MS);
      timeoutRef.current = localTimeoutId;

    } else if (uploadedFile && uploadedFile.status === 'uploading') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading" (${uploadedFile.name}). Waiting for 'success'. Previous validation state cleared.`);
      setExcelValidationState(null); // Clear previous validation if a new file is uploading
      // Do not clear worker here, as a 'success' might be imminent
    } else if (!uploadedFile || uploadedFile.status === 'error') {
      console.log(`[InquiryModal useEffect_uploadedFile] No valid file or file has error status: ${uploadedFile?.status}. Cleaning up. Error: ${uploadedFile?.errorMessage}`);
      clearWorkerAndTimeout(); // Clear worker if file is removed or had initial dropzone error
      setIsProcessing(false); // Ensure processing is false
      if(uploadedFile?.status === 'error') {
        setExcelValidationState({
          error: uploadedFile.errorMessage || "파일 업로드 중 오류 발생",
          hasData: false,
          isValid: false,
        });
      } else {
        setExcelValidationState(null);
      }
      currentFileRef.current = null;
    }

    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker: ${localWorkerInstance?.constructor?.name} Clearing localTimeoutId: ${localTimeoutId}`);
      if (localWorkerInstance) {
        localWorkerInstance.terminate();
      }
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
    };
  }, [uploadedFile, createExcelWorker, setupWorkerHandlers, handleExcelValidationComplete, clearWorkerAndTimeout]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile); 
    // Moved worker start logic to useEffect to handle `uploadedFile` state changes
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
      // setIsProcessing(false); // clearWorkerAndTimeout will handle this
      clearWorkerAndTimeout(); // Ensure everything is cleared
      currentFileRef.current = null;
      setActiveTab('excel');
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
    console.log("[InquiryModal handleSubmitInquiry] Clicked.");
    if (!user) {
      // toast({ title: "인증 오류", description: "문의를 제출하려면 로그인해야 합니다.", variant: "destructive" });
      console.error("인증 오류: 문의를 제출하려면 로그인해야 합니다.");
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
        // toast({
        //   title: "제출 불가",
        //   description: excelValidationState?.error || "유효한 Excel 파일을 업로드하고 데이터가 있는지 확인하세요.",
        //   variant: "destructive",
        // });
        console.error("제출 불가 (Excel):", excelValidationState?.error || "유효한 Excel 파일을 업로드하고 데이터가 있는지 확인하세요.");
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      const gridData = directEntryTabRef.current?.getGridData();
      if (gridData && gridData.length > 0) {
         dataToProcess = gridData;
      } else {
        // toast({ title: "데이터 없음", description: "제출할 데이터를 그리드에 입력하세요.", variant: "destructive" });
        console.error("데이터 없음 (직접 입력): 제출할 데이터를 그리드에 입력하세요.");
        setIsSubmitting(false);
        return;
      }
    }

    if (dataToProcess.length === 0) {
      // toast({ title: "데이터 없음", description: "제출할 데이터 행이 없습니다.", variant: "destructive" });
      console.error("데이터 없음: 제출할 데이터 행이 없습니다.");
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
        status: "Pending", // 문의 제출 시 초기 상태
        adminNotes: "", 
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

    console.log("[InquiryModal handleSubmitInquiry] Submitting document to Firestore:", JSON.stringify(inquiryDoc).substring(0, 500) + "...");

    try {
      await addDoc(collection(firestore, "inquiries"), inquiryDoc);
      // toast({
      //   title: "문의 제출 완료!",
      //   description: `성공적으로 ${dataRowsToSubmit.length}개 행을 제출했습니다.`,
      // });
      console.log(`[Toast (Disabled)] 문의 제출 완료! ${dataRowsToSubmit.length}개 행 제출.`);
      handleModalOpenChange(false); // Close modal on success
    } catch (error: any) {
      console.error("Error submitting inquiry to Firestore:", error);
      // toast({
      //   title: "제출 오류",
      //   description: `문의를 제출할 수 없습니다: ${error.message || '알 수 없는 Firestore 오류입니다.'}`,
      //   variant: "destructive",
      // });
      console.error(`[Toast (Disabled)] 제출 오류: ${error.message || '알 수 없는 Firestore 오류입니다.'}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [activeTab, excelValidationState, uploadedFile?.name, user, handleModalOpenChange /* toast dependency removed */]);

  const isSubmitDisabled = useMemo(() => {
    if (isSubmitting || isProcessing) return true;
    if (activeTab === 'excel') {
      return !excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData;
    }
    if (activeTab === 'direct') {
      // Direct entry can be submitted if not empty (logic within handleSubmitInquiry)
      // For the button state, we might just enable it unless actively submitting/processing.
      // Or, add a check to directEntryTabRef.current?.getGridData()?.length > 0 (but this ref might not be ready)
      return false;
    }
    return true;
  }, [isSubmitting, isProcessing, activeTab, excelValidationState]);
  
  // Final log before rendering ExcelUploadTab props
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
          <DialogTitle className="text-2xl">문의 제출</DialogTitle>
          <DialogDescription>
            Excel 파일을 업로드하거나 직접 정보를 입력하세요.
          </DialogDescription>
           {(isProcessing && activeTab === 'excel') && ( // Show loader only for excel tab processing
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
               파일 처리 중... {uploadedFile?.file && `(${(uploadedFile.file.size / 1024).toFixed(1)}KB)`}
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
            <TabsTrigger value="excel" disabled={isSubmitting || (isProcessing && activeTab === 'excel')}>Excel 업로드</TabsTrigger>
            <TabsTrigger value="direct" disabled={isSubmitting || (isProcessing && activeTab === 'excel')}>직접 입력</TabsTrigger>
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
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Image src="/submit-arrow.svg" alt="제출 아이콘" width={16} height={16} className="mr-2 h-4 w-4" />
            )}
            문의 제출
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
