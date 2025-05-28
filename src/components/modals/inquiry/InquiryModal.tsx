
"use client";

import type React from 'react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
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
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse, SubmittedInquiryDataRow } from '@/types/inquiry';
import type { SubmittedInquiryBase } from '@/types';
import { useToast as useUiToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, type DocumentData } from 'firebase/firestore';

const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const toastHookInstance = useUiToast();
  
  // Defensive toast function
  const toast = useCallback((options: Parameters<typeof toastHookInstance.toast>[0]) => {
    if (toastHookInstance && typeof toastHookInstance.toast === 'function') {
      return toastHookInstance.toast(options);
    }
    console.warn("Toast function is currently disabled or not ready (toastHookInstance or toastHookInstance.toast is invalid). Options:", options);
    return { id: '', dismiss: () => {}, update: (props: any) => {} };
  }, [toastHookInstance]);


  const [activeTab, setActiveTab] = useState<ActiveTab>('excel');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [excelValidationState, setExcelValidationState] = useState<ExcelValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // For Excel parsing
  const [isSubmitting, setIsSubmitting] = useState(false); // For Firestore submission

  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const directEntryTabRef = useRef<DirectEntryTabHandles>(null);
  const currentFileRef = useRef<File | null>(null);

  const { user } = useAuth();

  // Debug log for initial render and state
  console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);


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
    // Note: setIsProcessing(false) will be called by the calling context (onmessage, onerror, timeout, or cleanup)
    // to avoid race conditions or premature state changes.
    // However, if this function is called from places like modal close or file removal,
    // setIsProcessing should be explicitly set to false there.
  }, []);


  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    console.log("[InquiryModal] handleExcelValidationComplete received result:", result);

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
    
    setExcelValidationState(newValidationResult);

    if (newValidationResult.isValid && newValidationResult.hasData) {
      toast({
        title: "파일 유효성 검사 완료",
        description: `업로드된 Excel 파일이 유효하며 ${newValidationResult.totalDataRows || 0}개의 데이터 행을 포함합니다. 제출 시 모든 행이 처리됩니다.`,
      });
    }  else if (newValidationResult.isLargeFile && !newValidationResult.error) {
       toast({
        title: "대용량 파일 처리 완료",
        description: `${((newValidationResult.fileSize || 0) / (1024*1024)).toFixed(1)}MB 파일 처리 완료.`,
        variant: "default"
      });
    }
  }, [toast]);


  const createExcelWorker = useCallback((): Worker | null => {
    console.log('[InquiryModal createExcelWorker] Attempting to create worker.');
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
        worker.terminate();
        return;
      }

      console.log('[InquiryModal handleWorkerMessage] Worker ONMESSAGE. Data:', event.data);
      if (event.data.type === 'progress') {
        console.log(`[InquiryModal handleWorkerMessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
        return;
      }
      
      handleExcelValidationComplete(event.data);
      setIsProcessing(false); 
      console.log('[InquiryModal handleWorkerMessage ONMESSAGE] Setting isProcessing to FALSE.');
      clearWorkerAndTimeout(); 
    };

    worker.onerror = (errorEvent: ErrorEvent) => {
      if (workerRef.current !== worker || !currentFileRef.current || currentFileRef.current.name !== fileToProcess.name || currentFileRef.current.size !== fileToProcess.size) {
        console.warn('[InquiryModal handleWorkerMessage] Received error from an OUTDATED worker or for an OUTDATED file. Terminating this worker and ignoring error.');
        worker.terminate();
        return;
      }
      console.error('[InquiryModal handleWorkerMessage] Worker ONERROR. ErrorEvent:', errorEvent);
      const errorMessage = errorEvent.message || '알 수 없는 워커 오류입니다.';
      handleExcelValidationComplete({
        type: 'result', success: false, error: `워커 오류: ${errorMessage}`,
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: fileToProcess.size, isLargeFile: fileToProcess.size > (5 * 1024 * 1024),
      });
      setIsProcessing(false); 
      console.log('[InquiryModal handleWorkerMessage ONERROR] Setting isProcessing to FALSE.');
      clearWorkerAndTimeout();
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);


  useEffect(() => {
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    console.log(`[InquiryModal useEffect_uploadedFile] START. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}`);

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
      if (isProcessing) {
        console.log('[InquiryModal useEffect_uploadedFile] Already processing, skipping new worker start for:', uploadedFile.file.name);
        return; // Prevent starting a new worker if one is already processing this or another file.
      }
      console.log(`[InquiryModal useEffect_uploadedFile] Condition MET: File status is 'success'. Starting worker for:`, uploadedFile.file.name);
      
      // Explicitly clear any previous worker/timeout before starting new ones.
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
        toast({
          title: "대용량 파일 처리 중",
          description: `파일 크기가 ${(uploadedFile.file.size / (1024*1024)).toFixed(1)}MB입니다. 처리 시간이 오래 걸릴 수 있습니다.`,
        });
      }

      localWorkerInstance = createExcelWorker();
      if (!localWorkerInstance) {
        const errorMsg = 'Excel 처리 환경을 초기화할 수 없습니다.';
        console.error(`[InquiryModal useEffect_uploadedFile] Worker creation FAILED for ${uploadedFile.file.name}. Error: ${errorMsg}`);
        handleExcelValidationComplete({
            type: 'result', success: false, error: errorMsg,
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
          if (workerRef.current === localWorkerInstance && currentFileRef.current === uploadedFile?.file) {
              const timeoutMsg = `Excel 파일 처리 시간이 ${PROCESSING_TIMEOUT_MS / 1000}초를 초과했습니다.`;
              console.warn(`[InquiryModal useEffect_uploadedFile] Worker TIMEOUT for file ${uploadedFile?.file?.name}. Worker:`, localWorkerInstance, "Timeout ID:", localTimeoutId);
              handleExcelValidationComplete({
                  type: 'result', success: false, error: timeoutMsg,
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
    } else if (uploadedFile && uploadedFile.status === 'uploading') {
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading". Waiting for 'success'. Previous validation state cleared.`);
      setExcelValidationState(null); 
    } else if (!uploadedFile || uploadedFile.status === 'error') { 
      console.log(`[InquiryModal useEffect_uploadedFile] File removed or initial error. Status: ${uploadedFile?.status}. Cleaning up.`);
      clearWorkerAndTimeout(); 
      setIsProcessing(false); // Ensure processing is false if file is removed or had initial error
      if(uploadedFile?.status === 'error') {
        setExcelValidationState({ 
          error: uploadedFile.errorMessage || "파일 업로드 중 오류가 발생했습니다.",
          hasData: false,
          isValid: false,
          fullData: null,
          previewData: null,
          headersValid: false,
          totalDataRows: 0
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
  }, [uploadedFile, isProcessing, createExcelWorker, setupWorkerHandlers, handleExcelValidationComplete, clearWorkerAndTimeout, toast]); 


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile);
    // If a file is removed or initially fails, ensure processing stops & validation clears
    if (!newFile || newFile.status !== 'success') {
        if (newFile?.status === 'error') {
            console.log("[InquiryModal handleFileChange] File has error status from FileUploadZone.");
            setExcelValidationState({
                error: newFile.errorMessage || "파일 업로드 중 오류가 발생했습니다.",
                hasData: false, isValid: false, headersValid: false, totalDataRows: 0, fullData: null, previewData: null
            });
        } else {
             console.log("[InquiryModal handleFileChange] File removed or not 'success'. Clearing excelValidationState.");
            setExcelValidationState(null);
        }
        clearWorkerAndTimeout(); // Clear any ongoing worker
        setIsProcessing(false);   // Ensure processing is stopped
    }
  }, [clearWorkerAndTimeout]);


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
      setIsProcessing(false); 
      currentFileRef.current = null;
      setActiveTab('excel');
    }
    onOpenChange(isOpen);
  }, [onOpenChange, clearWorkerAndTimeout]);

  useEffect(() => {
    return () => {
      console.log("[InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      clearWorkerAndTimeout();
      setIsProcessing(false); // Double ensure on unmount
    };
  }, [clearWorkerAndTimeout]);

  const handleSubmitInquiry = useCallback(async () => {
    console.log("[InquiryModal handleSubmitInquiry] Clicked.");
    if (!user) {
      toast({ title: "인증 오류", description: "문의를 제출하려면 로그인해야 합니다.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    let dataRowsToSubmit: SubmittedInquiryDataRow[] = [];
    let sourceForDB: 'excel' | 'direct' = activeTab;
    let fileNameForDB: string | undefined = undefined;

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
        dataRowsToSubmit = excelValidationState.fullData.map(row => ({
            campaignKey: row[0] || '',
            campaignName: row[1] || '',
            adidOrIdfa: row[2] || '',
            userName: row[3] || '',
            contact: row[4] || '',
            remarks: row[5] || '',
            status: "처리 전", 
            adminNotes: "",
        }));
        fileNameForDB = uploadedFile?.name;
      } else {
        toast({
          title: "제출 불가",
          description: excelValidationState?.error || "유효한 Excel 파일을 업로드하고 데이터가 있는지 확인하세요.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      const gridData = directEntryTabRef.current?.getGridData();
      if (gridData && gridData.length > 0) {
         dataRowsToSubmit = gridData.map(row => ({
            campaignKey: row[0] || '',
            campaignName: row[1] || '',
            adidOrIdfa: row[2] || '',
            userName: row[3] || '',
            contact: row[4] || '',
            remarks: row[5] || '',
            status: "처리 전",
            adminNotes: "",
        }));
      } else {
        toast({ title: "데이터 없음", description: "제출할 데이터를 그리드에 입력하세요.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    }

    if (dataRowsToSubmit.length === 0) {
      toast({ title: "데이터 없음", description: "제출할 데이터 행이 없습니다.", variant: "destructive" });
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
      toast({
        title: "문의 제출 완료!",
        description: `성공적으로 ${dataRowsToSubmit.length}개 행을 제출했습니다.`,
      });
      handleModalOpenChange(false); 
    } catch (error: any) {
      console.error("Error submitting inquiry to Firestore:", error);
      toast({
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
      // For direct entry, enable if not submitting/processing. 
      // Actual data check happens in handleSubmitInquiry.
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
        <DialogHeader className="p-6 pb-2 text-center">
          <DialogTitle className="text-2xl">문의 제출</DialogTitle>
          <DialogDescription>
            Excel 파일을 업로드하거나 직접 정보를 입력하세요.
          </DialogDescription>
           {(isProcessing && activeTab === 'excel' && uploadedFile?.file) && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중... ({((uploadedFile.file.size || 0) / 1024).toFixed(1)}KB)
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
            제출
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
    

      