
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
import { useToast as uiToastHook } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const PROCESSING_TIMEOUT_MS = 5000; // 5초로 단축 (이전 프롬프트 반영)

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<File | null>(null); // 워커가 처리 중인 현재 파일 참조
  const directEntryTabRef = useRef<DirectEntryTabHandles>(null);

  const toastHookInstance = uiToastHook();
  const toast = useMemo(() => {
    if (toastHookInstance && typeof toastHookInstance.toast === 'function') {
      return toastHookInstance.toast;
    }
    console.warn("[InquiryModal] Toast function not available. Using dummy.");
    return (options: any) => {
      console.log("DUMMY TOAST (hook disabled/not ready):", options);
      return { id: '', dismiss: () => {}, update: () => {} };
    };
  }, [toastHookInstance]);
  
  const { user } = useAuth();

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
    // setIsProcessing(false)는 각 핸들러에서 명시적으로 호출
  }, []);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success || false, // 워커의 success 필드 사용
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

    if (newValidationResult.isValid && newValidationResult.hasData) {
      toast({
        title: "File Valid & Ready",
        description: `The uploaded Excel file is valid and contains ${newValidationResult.totalDataRows || 0} data row(s). Preview available. All rows will be processed.`,
      });
    } else if (newValidationResult.isLargeFile && newValidationResult.isValid && !newValidationResult.error) {
        toast({
            title: "Large File Processed",
            description: `Successfully processed a large file (${newValidationResult.fileSize ? (newValidationResult.fileSize / (1024*1024)).toFixed(1) : 'N/A'}MB).`,
            variant: "default",
            duration: 5000,
        });
    }
  }, [toast]);

  const createExcelWorker = useCallback((): Worker | null => {
    console.log('[InquiryModal createExcelWorker] Attempting to create worker.');
    try {
      if (typeof Worker === 'undefined') {
        console.error('[ERROR InquiryModal createExcelWorker] Worker not supported in this environment.');
        handleExcelValidationComplete({
          type: 'result', success: false, error: 'Web Workers are not supported in your browser.',
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: 0, isLargeFile: false,
        });
        return null;
      }
      // 워커 스크립트 경로가 프로젝트 구조에 맞게 설정되어 있는지 확인
      const worker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[InquiryModal createExcelWorker] Worker CREATED successfully:', worker);
      return worker;
    } catch (error) {
      console.error('[ERROR InquiryModal createExcelWorker] Worker creation failed:', error);
       handleExcelValidationComplete({
          type: 'result', success: false, error: 'Excel processing environment could not be initialized.',
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: 0, isLargeFile: false,
        });
      return null;
    }
  }, [handleExcelValidationComplete]);
  
  const setupWorkerHandlers = useCallback((worker: Worker, associatedFile: File) => {
    console.log('[InquiryModal setupWorkerHandlers] Setting up handlers for worker and file:', associatedFile.name);

    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      // 현재 처리 중인 파일과 워커가 일치하는지 확인
      if (workerRef.current === worker && currentFileRef.current?.name === associatedFile.name) {
        if (event.data.type === 'progress') {
          console.log(`[InquiryModal handleWorkerMessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
          return; 
        }
        console.log('[InquiryModal handleWorkerMessage] Worker ONMESSAGE. Data:', event.data);
        handleExcelValidationComplete(event.data);
        setIsProcessing(false); 
        clearWorkerAndTimeout(); 
      } else {
         console.warn('[InquiryModal handleWorkerMessage] Received message from STALE worker/file. IGNORED. Current worker:', workerRef.current, 'Msg worker:', worker, 'Current file:', currentFileRef.current?.name, 'Msg file:', associatedFile.name);
      }
    };

    worker.onerror = (errorEvent) => {
       if (workerRef.current === worker && currentFileRef.current?.name === associatedFile.name) {
        console.error('[InquiryModal handleWorkerError] Worker ONERROR. ErrorEvent:', errorEvent);
        handleExcelValidationComplete({
          type: 'result', success: false, error: `Worker error: ${errorEvent.message || 'Unknown worker error.'}`,
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: associatedFile.size, isLargeFile: associatedFile.size > (5 * 1024 * 1024)
        });
        setIsProcessing(false);
        clearWorkerAndTimeout();
      } else {
        console.warn('[InquiryModal handleWorkerError] Received error from STALE worker/file. IGNORED.');
      }
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);
  
  // uploadedFile의 status와 file 객체 자체를 분리하여 useMemo로 관리 (가이드 아이디어)
  const memoizedFileObject = useMemo(() => uploadedFile?.file, [uploadedFile?.file]);
  const memoizedUploadedFileStatus = useMemo(() => uploadedFile?.status, [uploadedFile?.status]);

  useEffect(() => {
    console.log('[InquiryModal useEffect_uploadedFile] START.', { uploadedFileStatus: memoizedUploadedFileStatus, fileObjectExists: !!memoizedFileObject, isProcessing });
    
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (memoizedUploadedFileStatus === 'success' && memoizedFileObject && !isProcessing && !workerRef.current) {
      console.log('[InquiryModal useEffect_uploadedFile] Condition MET: File status is "success", not processing, no active worker. Starting worker for:', memoizedFileObject.name);
      
      currentFileRef.current = memoizedFileObject; // 현재 처리할 파일 설정
      setExcelValidationState(null); // 이전 유효성 검사 결과 초기화
      setIsProcessing(true); // 처리 중 상태로 변경
      console.log('[InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE.');

      if (memoizedFileObject.size > 10 * 1024 * 1024) { // 10MB
        toast({
            title: "Processing Very Large File",
            description: `The uploaded Excel file (${(memoizedFileObject.size / (1024*1024)).toFixed(1)}MB) is very large and may take some time. Please wait.`,
            duration: 10000,
        });
      }
      
      localWorkerInstance = createExcelWorker();

      if (!localWorkerInstance) {
        console.error("[InquiryModal useEffect_uploadedFile] Failed to create worker instance in SUCCESS block.");
        setIsProcessing(false); 
        currentFileRef.current = null;
        return; 
      }
      
      workerRef.current = localWorkerInstance; // 생성된 워커를 ref에 할당
      setupWorkerHandlers(localWorkerInstance, memoizedFileObject); // 핸들러 설정
      
      console.log('[InquiryModal useEffect_uploadedFile] Posting message to worker with file:', memoizedFileObject.name);
      localWorkerInstance.postMessage({ file: memoizedFileObject } as WorkerParseRequest); // 워커에 파일 전달

      localTimeoutId = setTimeout(() => {
        // 타임아웃 발생 시, 현재 ref의 워커와 타임아웃 ID가 이 useEffect 실행 시점의 것과 일치하는지 확인
        if (workerRef.current === localWorkerInstance && timeoutRef.current === localTimeoutId && currentFileRef.current?.name === memoizedFileObject.name) { 
            console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for file:', memoizedFileObject.name);
            handleExcelValidationComplete({
                type: 'result', success: false, error: `Excel file processing timed out (${PROCESSING_TIMEOUT_MS / 1000} seconds).`,
                previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                fileSize: memoizedFileObject.size, isLargeFile: memoizedFileObject.size > (5 * 1024 * 1024)
            });
            setIsProcessing(false); // 처리 중 상태 해제
            clearWorkerAndTimeout(); // 워커 및 타임아웃 정리
        } else {
             console.log('[InquiryModal useEffect_uploadedFile] Timeout for STALE worker/file or mismatched file. IGNORED.');
        }
      }, PROCESSING_TIMEOUT_MS);
      timeoutRef.current = localTimeoutId; // 생성된 타임아웃 ID를 ref에 할당

    } else if (memoizedUploadedFileStatus === 'uploading') {
      console.log('[InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for \'success\'. Previous validation state cleared.');
      setExcelValidationState(null); // 'uploading' 중에는 이전 검증 결과 초기화
    } else if (!memoizedFileObject || memoizedUploadedFileStatus === 'error' || memoizedUploadedFileStatus === 'idle') {
      console.log(`[InquiryModal useEffect_uploadedFile] File removed, initial error, or idle. Status: ${memoizedUploadedFileStatus}. Cleaning up.`);
      clearWorkerAndTimeout(); 
      setIsProcessing(false); 
      if (memoizedUploadedFileStatus === 'error' && uploadedFile?.errorMessage) { // uploadedFile 사용
        setExcelValidationState({ isValid: false, error: uploadedFile.errorMessage, hasData: false, headersValid: false });
      } else if (!memoizedFileObject) {
         setExcelValidationState(null);
      }
    }

    // useEffect의 클린업 함수: 이 useEffect 실행으로 생성된 로컬 워커/타임아웃만 정리 시도
    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker: ${localWorkerInstance} Clearing localTimeoutId: ${localTimeoutId}`);
      if (localWorkerInstance && workerRef.current === localWorkerInstance) { // 현재 ref와 일치할 때만 정리
        console.log("[InquiryModal useEffect_uploadedFile CLEANUP] Terminating workerRef.current as it matches localWorkerInstance");
        localWorkerInstance.terminate();
        workerRef.current = null;
      }
      if (localTimeoutId && timeoutRef.current === localTimeoutId) { // 현재 ref와 일치할 때만 정리
        console.log("[InquiryModal useEffect_uploadedFile CLEANUP] Clearing timeoutRef.current as it matches localTimeoutId");
        clearTimeout(localTimeoutId);
        timeoutRef.current = null;
      }
    };
  }, [memoizedFileObject, memoizedUploadedFileStatus, isProcessing, createExcelWorker, setupWorkerHandlers, clearWorkerAndTimeout, handleExcelValidationComplete, toast, uploadedFile?.errorMessage]); // uploadedFile 사용


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile); 
    // 파일이 제거되거나 드롭존에서 초기 오류 발생 시 상태 초기화는 useEffect에서 처리
    if (!newFile || newFile.status !== 'success') {
        console.log("[InquiryModal handleFileChange] File removed or dropzone error. Triggering cleanup via useEffect.");
        // setExcelValidationState(null); // useEffect에서 처리
        // setIsProcessing(false);       // useEffect에서 처리
        // clearWorkerAndTimeout();      // useEffect에서 처리
    }
  }, []);

  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}.`);
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null); 
      setExcelValidationState(null);
      setActiveTab('excel');
      setIsProcessing(false); // 확실하게 처리 중 상태 해제
      clearWorkerAndTimeout(); // 모든 워커/타임아웃 정리
      currentFileRef.current = null; // 현재 파일 참조도 초기화
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout]);

  // 최종 컴포넌트 언마운트 시 정리
  useEffect(() => {
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
    setIsSubmitting(true); // DB 제출 로딩 상태 시작

    let dataRowsToSubmit: SubmittedInquiryDataRow[] = [];
    let sourceForDB: 'excel' | 'direct' = activeTab;
    let fileNameForDB: string | undefined = undefined;

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        // fullData는 이미 string[][] 형태의 6열 데이터임 (헤더 제외)
        excelValidationState.fullData.forEach(row => {
          dataRowsToSubmit.push({
            campaignKey: row[0] || '',
            campaignName: row[1] || '',
            adidOrIdfa: row[2] || '',
            userName: row[3] || '',
            contact: row[4] || '',
            remarks: row[5] || '',
          });
        });
        fileNameForDB = uploadedFile?.name;
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
      const gridData = directEntryTabRef.current?.getGridData(); // string[][] 형태
      if (gridData && gridData.length > 0) {
         gridData.forEach(row => {
          dataRowsToSubmit.push({
            campaignKey: row[0] || '',
            campaignName: row[1] || '',
            adidOrIdfa: row[2] || '',
            userName: row[3] || '',
            contact: row[4] || '',
            remarks: row[5] || '',
          });
        });
      } else {
        toast({ title: "No Data", description: "Please enter data in the grid to submit.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    }

    if (dataRowsToSubmit.length === 0) {
      toast({ title: "No Data", description: "No data to submit.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const inquiryDoc: SubmittedInquiry = {
      userId: user.id,
      submittedAt: serverTimestamp(),
      source: sourceForDB,
      fileName: fileNameForDB,
      data: dataRowsToSubmit,
    };

    try {
      console.log("[InquiryModal handleSubmitInquiry] Submitting to Firestore:", inquiryDoc);
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
      setIsSubmitting(false); // DB 제출 로딩 상태 종료
    }
  }, [activeTab, excelValidationState, uploadedFile?.name, user, toast, handleModalOpenChange]);
  
  // Excel 탭에서 Submit 버튼 비활성화 조건
  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true; // isSubmitting, isProcessing 둘 다 고려
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData) {
      return true;
    }
    return false;
  };

  // Direct Entry 탭에서 Submit 버튼 비활성화 조건 (간단하게)
  const isDirectSubmitDisabled = () => {
    return isSubmitting || isProcessing; // isProcessing 추가
  };
  
  console.log('[InquiryModal] Rendering.', { 
    isProcessing, 
    uploadedFileStatus: uploadedFile?.status, 
    excelValidationStateError: excelValidationState?.error 
  });
  console.log('[InquiryModal] Final rendering states for ExcelUploadTab:', {
    isProcessing: isProcessing,
    uploadedFileStatus: uploadedFile?.status,
    excelError: excelValidationState?.error,
    excelHasData: excelValidationState?.hasData,
  });


  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent 
        className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col"
        onInteractOutside={(event) => {
          if (isProcessing) { // 파싱 중에는 외부 클릭으로 닫히지 않도록
            console.log("[InquiryModal DialogContent] onInteractOutside prevented due to isProcessing.");
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="p-6 pb-2 text-center">
          <DialogTitle className="text-2xl">Submit Inquiry</DialogTitle>
          <DialogDescription>
            Upload an Excel file or enter details manually.
          </DialogDescription>
          {/* 전역 isProcessing 상태에 따른 로딩 UI */}
          {isProcessing && activeTab === 'excel' && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중... ({uploadedFile?.file ? ((uploadedFile.file.size || 0) / 1024).toFixed(1) : 'N/A'}KB)
            </div>
          )}
           {/* 파싱 완료 후 성능 정보 표시 */}
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
                isProcessingGlobal={isProcessing} // InquiryModal의 isProcessing 상태 전달
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
            type="button" // 명시적으로 type="button" 추가
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
