"use client";

import type React from 'react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { ExcelUploadTab } from './ExcelUploadTab';
import { DirectEntryTab, type DirectEntryTabHandles } from './DirectEntryTab';
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse, SubmittedInquiryDataRow } from '@/types/inquiry';
import { useToast as useUiToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, type DocumentData } from 'firebase/firestore';

const PROCESSING_TIMEOUT_MS = 5000;

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

const MotionTabsPrimitiveContent = motion(TabsPrimitive.Content);

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const { toast: actualUiToast } = useUiToast();
  const toast = useCallback((options: Parameters<typeof actualUiToast>[0]) => {
    if (actualUiToast && typeof actualUiToast === 'function') {
      return actualUiToast(options);
    }
    console.warn("Toast function is currently disabled or not ready. Options:", options);
    return { id: 'fallback-toast', dismiss: () => {}, update: (props: any) => {} };
  }, [actualUiToast]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const directEntryTabRef = useRef<DirectEntryTabHandles>(null);
  const currentFileRef = useRef<File | null>(null);

  const { user } = useAuth();

  console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);

  const clearWorkerAndTimeout = useCallback(() => {
    const wasProcessing = workerRef.current || timeoutRef.current;
    console.log('[InquiryModal] clearWorkerAndTimeout called.', {
        currentWorker: !!workerRef.current,
        currentTimeout: !!timeoutRef.current,
        wasProcessing
    });

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
    // Only set isProcessing to false if it was actually processing or if this cleanup is intended to stop processing
    if (wasProcessing) {
      setIsProcessing(false);
      console.log('[InquiryModal clearWorkerAndTimeout] Set isProcessing to FALSE.');
    } else {
      console.log('[InquiryModal clearWorkerAndTimeout] No active worker/timeout, isProcessing remains unchanged by this call.');
    }
  }, [setIsProcessing]);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    let displayError: string | null = null;
    if (result.error) {
      const lowerError = result.error.toLowerCase();
      if (lowerError.includes("데이터가 없습니다") || lowerError.includes("내용이 없습니다") || lowerError.includes("no data")) {
        displayError = "Excel 파일에 데이터가 없습니다.";
      } else if (lowerError.includes("열 구조") || lowerError.includes("헤더") || lowerError.includes("컬럼") || lowerError.includes("column structure")) {
        displayError = "Excel 파일의 열 구조가 올바르지 않습니다. 6개의 열로 구성된 데이터를 업로드해주세요.";
      } else if (lowerError.includes("지원하지 않는") || lowerError.includes("파일 형식") || lowerError.includes("file type") || lowerError.includes("xlsx.read") || lowerError.includes("parsing error")) {
        displayError = "지원하지 않는 파일 형식입니다. Excel 파일(xlsx, xls, csv)을 업로드해주세요.";
      } else {
        // 이전에 일반화된 메시지 (예: 타임아웃, 워커 내부 오류 등) 또는 기타 워커 오류
        displayError = result.error; // 일단 워커가 보낸 메시지 유지, 아래에서 더 일반화 가능
      }
    }

    const newValidationResult: ExcelValidationResult = {
      isValid: result.success,
      error: displayError, // Key-word based simplified message
      hasData: result.dataExistsInSheet || false,
      previewData: result.previewData || null,
      fullData: result.fullData || null,
      totalDataRows: result.totalDataRows || 0,
      headersValid: result.headersValid || false,
      fileSize: result.fileSize,
      processingTime: result.processingTime,
      isLargeFile: result.isLargeFile,
    };
    console.log("[InquiryModal] handleExcelValidationComplete received result, setting excelValidationState:", newValidationResult);
    setExcelValidationState(newValidationResult);

    if (newValidationResult.isValid && newValidationResult.hasData) {
       toast({ // 토스트 기능 재활성화
        title: "파일 유효성 검사 완료",
        description: `업로드된 Excel 파일이 유효하며 ${newValidationResult.totalDataRows || 0}개의 데이터 행을 포함합니다. 제출 시 모든 행이 처리됩니다.`,
      });
    } else if (newValidationResult.isLargeFile && !newValidationResult.error) {
       toast({ // 토스트 기능 재활성화
        title: "대용량 파일 처리 완료",
        description: `${((newValidationResult.fileSize || 0) / (1024*1024)).toFixed(1)}MB 파일 처리 완료.`,
        variant: "default"
      });
    }
  }, [toast]);

  const createExcelWorker = useCallback((): Worker | null => {
    try {
      if (typeof Worker === 'undefined') {
        console.error('[InquiryModal createExcelWorker] Web Workers are not supported in this browser.');
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
       if (workerRef.current !== worker || !currentFileRef.current || currentFileRef.current.name !== fileToProcess.name || currentFileRef.current.size !== fileToProcess.size) {
        console.warn('[InquiryModal handleWorkerMessage] Received message from an OUTDATED worker or for an OUTDATED file. Terminating this worker and ignoring message.');
        worker.terminate(); // Terminate the specific outdated worker instance
        return;
      }

      console.log('[InquiryModal handleWorkerMessage] Worker ONMESSAGE. Data:', event.data);
      if (event.data.type === 'progress') {
        console.log(`[InquiryModal handleWorkerMessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
        // Optionally update UI with progress here
        return;
      }

      handleExcelValidationComplete(event.data);
      setIsProcessing(false); // Moved from clearWorkerAndTimeout to ensure it's called after validation state is set
      console.log('[InquiryModal handleWorkerMessage ONMESSAGE] Set isProcessing to FALSE.');
      clearWorkerAndTimeout(); // Now this mainly clears refs and timeout
    };

    worker.onerror = (errorEvent: ErrorEvent) => {
      if (workerRef.current !== worker || !currentFileRef.current || currentFileRef.current.name !== fileToProcess.name || currentFileRef.current.size !== fileToProcess.size) {
        console.warn('[InquiryModal handleWorkerMessage] Received error from an OUTDATED worker or for an OUTDATED file. Terminating this worker and ignoring error.');
        worker.terminate();
        return;
      }
      console.error('[InquiryModal handleWorkerMessage] Worker ONERROR. ErrorEvent:', errorEvent);
      const simplifiedErrorMessage = "파일을 처리하는 중 오류가 발생했습니다. 파일을 확인하거나 다시 시도해 주세요."; // Generic message for all worker errors
      handleExcelValidationComplete({
        type: 'result', success: false, error: simplifiedErrorMessage, 
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: fileToProcess.size, isLargeFile: fileToProcess.size > (5 * 1024 * 1024),
      });
      setIsProcessing(false); // Moved from clearWorkerAndTimeout
      console.log('[InquiryModal handleWorkerMessage ONERROR] Set isProcessing to FALSE.');
      clearWorkerAndTimeout();
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout, setIsProcessing]);


 useEffect(() => {
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}`);

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
      if (isProcessing && workerRef.current) {
        console.log('[InquiryModal useEffect_uploadedFile] Already processing with an active worker, skipping new worker start for:', uploadedFile.file.name);
        return;
      }
      console.log(`[InquiryModal useEffect_uploadedFile] Condition MET: File status is 'success'. Starting worker for:`, uploadedFile.file.name);
      
      if (workerRef.current) {
        console.log("[InquiryModal useEffect_uploadedFile] Terminating PREVIOUS worker (from workerRef.current) before starting new one:", workerRef.current);
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        console.log("[InquiryModal useEffect_uploadedFile] Clearing PREVIOUS timeout (from timeoutRef.current) before starting new one:", timeoutRef.current);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setExcelValidationState(null); 
      setIsProcessing(true);      
      console.log(`[InquiryModal useEffect_uploadedFile] Just set isProcessing to TRUE for ${uploadedFile.file.name}`);
      currentFileRef.current = uploadedFile.file;

      if (uploadedFile.file.size > 5 * 1024 * 1024) { 
         toast({ // 토스트 기능 재활성화
          title: "대용량 파일 처리 중",
          description: `파일 크기가 ${(uploadedFile.file.size / (1024*1024)).toFixed(1)}MB입니다. 처리 시간이 오래 걸릴 수 있습니다.`,
        });
      }

      localWorkerInstance = createExcelWorker();
      if (!localWorkerInstance) {
        const simplifiedErrorMsg = "파일 분석 기능을 시작할 수 없습니다. 페이지를 새로고침해 주세요.";
        console.error(`[InquiryModal useEffect_uploadedFile] Worker creation FAILED for ${uploadedFile.file.name}. Error: ${simplifiedErrorMsg}`);
        handleExcelValidationComplete({
            type: 'result', success: false, error: simplifiedErrorMsg,
            previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize: uploadedFile.file.size, isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024)
        });
        setIsProcessing(false); 
        console.log(`[InquiryModal useEffect_uploadedFile] Set isProcessing to FALSE due to worker creation failure for ${uploadedFile.file.name}`);
        currentFileRef.current = null; 
      } else {
        workerRef.current = localWorkerInstance; 
        setupWorkerHandlers(localWorkerInstance, uploadedFile.file);
        
        console.log(`[InquiryModal useEffect_uploadedFile] Posting message to worker for file: ${uploadedFile.file.name}`);
        localWorkerInstance.postMessage({ file: uploadedFile.file });

        localTimeoutId = setTimeout(() => {
          if (workerRef.current === localWorkerInstance && currentFileRef.current?.name === uploadedFile?.file?.name) {
              const simplifiedTimeoutMsg = "파일 처리 시간이 초과되었습니다. 파일 크기나 형식을 확인해 주세요.";
              console.warn(`[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for file ${uploadedFile?.file?.name}. Worker:`, localWorkerInstance, "Timeout ID:", localTimeoutId);
              handleExcelValidationComplete({
                  type: 'result', success: false, error: simplifiedTimeoutMsg,
                  previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                  fileSize: uploadedFile?.file.size || 0, isLargeFile: (uploadedFile?.file.size || 0) > (5 * 1024 * 1024)
              });
              setIsProcessing(false); 
              console.log(`[InquiryModal useEffect_uploadedFile] Set isProcessing to FALSE due to TIMEOUT for ${uploadedFile?.file?.name}`);
              clearWorkerAndTimeout(); 
          } else {
              console.log('[InquiryModal useEffect_uploadedFile] Timeout occurred for an outdated worker/file. Ignoring and clearing local timeout.', localTimeoutId);
              if(localTimeoutId) clearTimeout(localTimeoutId); 
          }
        }, PROCESSING_TIMEOUT_MS);
        timeoutRef.current = localTimeoutId; 
      }
    } else if (uploadedFile && uploadedFile.status === 'error') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "error". Handling error. Error from dropzone:`, uploadedFile.errorMessage);
      setExcelValidationState({
          isValid: false,
          error: "파일 업로드에 실패했습니다. 다시 시도해 주세요.",
          hasData: false,
          headersValid: false,
          totalDataRows: 0,
          fullData: null,
          previewData: null,
          fileSize: uploadedFile.file?.size
      });
      clearWorkerAndTimeout(); // Ensure cleanup if dropzone itself errored
      setIsProcessing(false); // Ensure processing is false
    } else if (uploadedFile && uploadedFile.status === 'idle') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "idle". Waiting for 'success'.`);
      setExcelValidationState(null); // Clear previous validation while new file is "idle"
    } else if (!uploadedFile) { // File removed or initial state
      console.log('[InquiryModal useEffect_uploadedFile] No valid file or file removed. Cleaning up states.');
      clearWorkerAndTimeout();
      setExcelValidationState(null);
      currentFileRef.current = null;
      // setIsProcessing(false); // Should be handled by clearWorkerAndTimeout if it was true
    }

    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for this effect run. Terminating localWorker (if it was this run's worker): ${localWorkerInstance?.constructor?.name} Clearing localTimeoutId: ${localTimeoutId}`);
      if (localWorkerInstance && workerRef.current === localWorkerInstance) {
        // Only terminate if this instance is still the active one
        console.log("[InquiryModal useEffect_uploadedFile CLEANUP] Terminating worker from cleanup:", localWorkerInstance);
        localWorkerInstance.terminate();
        workerRef.current = null;
      }
      if (localTimeoutId && timeoutRef.current === localTimeoutId) {
         console.log("[InquiryModal useEffect_uploadedFile CLEANUP] Clearing timeout from cleanup:", localTimeoutId);
        clearTimeout(localTimeoutId);
        timeoutRef.current = null;
      }
    };
  }, [uploadedFile, createExcelWorker, setupWorkerHandlers, handleExcelValidationComplete, clearWorkerAndTimeout, toast]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile);
    // If a file is removed, or if it's an initial error from FileUploadZone.
    // Actual processing logic is in the useEffect above.
    if (!newFile || newFile.status !== 'success') {
        if(newFile?.status === 'error') {
          console.log("[InquiryModal handleFileChange] File has error status from FileUploadZone. Setting validation state.");
           setExcelValidationState({
                isValid: false,
                error: newFile.errorMessage || "파일 업로드 중 오류가 발생했습니다.",
                hasData: false, headersValid: false, totalDataRows: 0, fullData: null, previewData: null,
                fileSize: newFile.file?.size
            });
        } else if (!newFile) { // File explicitly removed
            console.log("[InquiryModal handleFileChange] File removed. Clearing validation and processing states.");
            setExcelValidationState(null);
        }
        // If an active worker was running for a previous file, and now a new file is uploaded (or removed)
        // the useEffect watching `uploadedFile` will handle cleaning up the old worker.
        // We might still want to ensure `isProcessing` is false if the new file is an error or null.
        if (!newFile || newFile.status === 'error') {
            setIsProcessing(false);
            clearWorkerAndTimeout(); // Aggressively clear if file is removed or errored out early
        }
    }
  }, [setIsProcessing, clearWorkerAndTimeout]);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}`);
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting states and cleaning worker/timeout.");
      setUploadedFile(null);
      setExcelValidationState(null);
      clearWorkerAndTimeout();
      setIsProcessing(false); // Explicitly set isProcessing to false
      currentFileRef.current = null;
      setActiveTab('excel');
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout, setIsProcessing]);

  useEffect(() => {
    // Component unmount cleanup
    return () => {
      console.log("[InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
      // setIsProcessing(false); // Should be handled by clearWorkerAndTimeout
    };
  }, [clearWorkerAndTimeout]);


  const handleSubmitInquiry = useCallback(async () => {
    console.log("[InquiryModal handleSubmitInquiry] Clicked.");
    if (!user) {
       toast({ title: "인증 오류", description: "문의를 제출하려면 로그인해야 합니다.", variant: "destructive" }); // 토스트 기능 재활성화
      return;
    }

    setIsSubmitting(true);

    let dataRowsToSubmit: SubmittedInquiryDataRow[] = [];
    let sourceForDB: 'excel' | 'direct' = activeTab;
    let fileNameForDB: string | undefined = undefined;

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        dataRowsToSubmit = excelValidationState.fullData.map(excelRow => ({
            campaignKey: excelRow[0] || '',
            campaignName: excelRow[1] || '',
            adidOrIdfa: excelRow[2] || '',
            userName: excelRow[3] || '',
            contact: excelRow[4] || '',
            remarks: excelRow[5] || '',
            status: "처리 전", // 초기 상태를 한국어로 설정
            adminNotes: "",
        }));
        fileNameForDB = uploadedFile?.name;
      } else {
         toast({ // 토스트 기능 재활성화
          title: "제출 불가",
          description: excelValidationState?.error || "제출할 수 없는 파일입니다. 파일 상태를 확인해 주세요.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      const gridData = directEntryTabRef.current?.getGridData();
      if (gridData && gridData.length > 0) {
         dataRowsToSubmit = gridData.map(directRow => ({
            campaignKey: directRow[0] || '',
            campaignName: directRow[1] || '',
            adidOrIdfa: directRow[2] || '',
            userName: directRow[3] || '',
            contact: directRow[4] || '',
            remarks: directRow[5] || '',
            status: "처리 전", // 초기 상태를 한국어로 설정
            adminNotes: "",
        }));
      } else {
         toast({ title: "데이터 없음", description: "제출할 데이터를 그리드에 입력하세요.", variant: "destructive" }); // 토스트 기능 재활성화
        setIsSubmitting(false);
        return;
      }
    }

    if (dataRowsToSubmit.length === 0) {
       toast({ title: "데이터 없음", description: "제출할 데이터 행이 없습니다.", variant: "destructive" }); // 토스트 기능 재활성화
      setIsSubmitting(false);
      return;
    }

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
       toast({ // 토스트 기능 재활성화
        title: "문의 제출 완료!",
        description: `성공적으로 ${dataRowsToSubmit.length}개 행을 제출했습니다.`,
      });
      handleModalOpenChange(false);
    } catch (error: any) {
      console.error("Error submitting inquiry to Firestore:", error);
       toast({ // 토스트 기능 재활성화
        title: "제출 오류",
        description: `문의를 제출할 수 없습니다: ${error.message || '알 수 없는 Firestore 오류입니다.'}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [activeTab, excelValidationState, uploadedFile?.name, user, toast, handleModalOpenChange, directEntryTabRef]);

  const isSubmitDisabled = useMemo(() => {
    if (isSubmitting || isProcessing) return true;
    if (activeTab === 'excel') {
      return !excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData || !excelValidationState.headersValid;
    }
    if (activeTab === 'direct') {
      return false;
    }
    return true;
  }, [isSubmitting, isProcessing, activeTab, excelValidationState]);

  console.log('[InquiryModal] Final rendering states for ExcelUploadTab:', {
    isProcessing,
    uploadedFileStatus: uploadedFile?.status,
    excelError: excelValidationState?.error,
    excelHasData: excelValidationState?.hasData,
  });

  const tabContentVariants = {
    initial: { opacity: 0, x: 10 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.2, ease: "easeInOut" } },
    exit: { opacity: 0, x: -10, transition: { duration: 0.15, ease: "easeInOut" } },
  };

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent 
        className="max-w-[1320px] w-[95vw] sm:w-[90vw] md:w-[1320px] p-0 data-[state=open]:h-auto sm:h-[840px] sm:max-h-[840px] flex flex-col"
        onInteractOutside={(event) => {
          if (isProcessing) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="p-6 pb-2 text-center">
          <DialogTitle>문의 접수</DialogTitle>
          {isProcessing && (
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
            <TabsTrigger value="excel" disabled={isSubmitting || (isProcessing && activeTab === 'excel')}>Excel 업로드</TabsTrigger>
            <TabsTrigger value="direct" disabled={isSubmitting || (isProcessing && activeTab === 'excel')}>직접 입력</TabsTrigger>
          </TabsList>

          <div className="flex-grow overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent min-h-[450px]">
            <AnimatePresence mode="wait">
              {activeTab === 'excel' && (
                <MotionTabsPrimitiveContent
                  key="excel-tab-content"
                  value="excel"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={cn(
                    "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "h-full"
                  )}
                  forceMount
                >
                  <ExcelUploadTab
                    onFileChange={handleFileChange}
                    isProcessingGlobal={isProcessing}
                    uploadedFileState={uploadedFile}
                    excelValidationState={excelValidationState}
                  />
                </MotionTabsPrimitiveContent>
              )}
              {activeTab === 'direct' && (
                <MotionTabsPrimitiveContent
                  key="direct-tab-content"
                  value="direct"
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={cn(
                    "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "h-full"
                  )}
                  forceMount
                >
                  <DirectEntryTab ref={directEntryTabRef} />
                </MotionTabsPrimitiveContent>
              )}
            </AnimatePresence>
          </div>
        </Tabs>

        <DialogFooter className="p-6 border-t bg-muted/30 flex-shrink-0">
          <div className="flex gap-2 justify-end">
            <Button 
              onClick={handleSubmitInquiry} 
              disabled={isSubmitDisabled}
              className={isSubmitting 
                ? "cursor-not-allowed opacity-50" 
                : "bg-gradient-to-r from-blue-400 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white font-semibold opacity-90"}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              접수
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
