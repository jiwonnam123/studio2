
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
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse, WorkerParseRequest, SubmittedInquiryDataRow } from '@/types';
import { useToast } from '@/hooks/use-toast'; 
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

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  const toastHookInstance = useToast();
  const toast = toastHookInstance?.toast || ((options: any) => {
    console.warn("토스트 함수를 사용할 수 없어 더미를 사용합니다. 옵션:", options);
    return { id: '', dismiss: () => {}, update: () => {} };
  });

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

  console.log(`[InquiryModal] 렌더링. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status} excelValidationState error: ${excelValidationState?.error}`);

  const clearWorkerAndTimeout = useCallback(() => {
    console.log('[InquiryModal] clearWorkerAndTimeout 호출됨.');
    if (workerRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] 워커 종료 중:', workerRef.current);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (timeoutRef.current) {
      console.log('[InquiryModal clearWorkerAndTimeout] 타임아웃 해제 중:', timeoutRef.current);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // setIsProcessing(false); // 이제 핸들러 내부에서 isProcessing을 직접 false로 설정합니다.
  }, []);

  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    console.log("[InquiryModal] handleExcelValidationComplete 결과 수신:", result);
    
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
      // 토스트 기능 임시 주석 처리
      /*
      toast({
        title: "파일 유효 및 준비 완료",
        description: `업로드된 Excel 파일이 유효하며 ${newValidationResult.totalDataRows || 0}개의 데이터 행을 포함합니다. 아래 미리보기를 확인하세요. 모든 행은 제출 시 처리됩니다.`,
      });
      */
       console.log("파일 유효 및 준비 완료 토스트 (주석 처리됨)");
    } else if (newValidationResult.isLargeFile && !newValidationResult.error) {
       // 토스트 기능 임시 주석 처리
       /*
       toast({
        title: "대용량 파일 처리 완료",
        description: `성공적으로 대용량 파일 (${((newValidationResult.fileSize || 0) / (1024*1024)).toFixed(1)}MB)을 처리했습니다. 미리보기가 제한될 수 있습니다.`,
        variant: "default"
      });
      */
      console.log("대용량 파일 처리 완료 토스트 (주석 처리됨)");
    }
  }, [/* toast */]); // toast 의존성 제거 (임시)

  const createExcelWorker = useCallback((): Worker | null => {
    try {
      if (typeof Worker === 'undefined') {
        console.error('[InquiryModal createExcelWorker] 이 브라우저에서는 워커를 지원하지 않습니다.');
        handleExcelValidationComplete({
          success: false, error: '웹 워커를 지원하지 않는 브라우저입니다.',
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: currentFileRef.current?.size || 0,
          isLargeFile: (currentFileRef.current?.size || 0) > 5 * 1024 * 1024,
          type: 'result'
        });
        return null;
      }
      const workerInstance = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), { type: 'module' });
      console.log('[InquiryModal createExcelWorker] 워커가 성공적으로 생성되었습니다:', workerInstance);
      return workerInstance;
    } catch (error) {
      console.error('[InquiryModal createExcelWorker] 워커 생성 실패:', error);
      handleExcelValidationComplete({
        success: false, error: 'Excel 처리 환경을 초기화할 수 없습니다.',
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: currentFileRef.current?.size || 0,
        isLargeFile: (currentFileRef.current?.size || 0) > 5 * 1024 * 1024,
        type: 'result'
      });
      return null;
    }
  }, [handleExcelValidationComplete]);

  const setupWorkerHandlers = useCallback((worker: Worker, processingFile: File) => {
    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      if (currentFileRef.current !== processingFile || workerRef.current !== worker) {
        console.warn('[InquiryModal setupWorkerHandlers] 오래되었거나 일치하지 않는 워커/파일로부터 메시지 수신. 무시됨.');
        worker.terminate(); 
        return;
      }
      console.log('[InquiryModal setupWorkerHandlers] 워커 ONMESSAGE. 데이터:', event.data);
      if (event.data.type === 'progress') {
        console.log(`[InquiryModal handleWorkerMessage] 워커 진행률: 단계: ${event.data.stage}, 진행률: ${event.data.progress}%`);
        return;
      }
      handleExcelValidationComplete(event.data);
      setIsProcessing(false);
      console.log('[InquiryModal setupWorkerHandlers ONMESSAGE] isProcessing을 FALSE로 설정.');
      clearWorkerAndTimeout(); 
    };

    worker.onerror = (errorEvent: ErrorEvent) => {
      if (currentFileRef.current !== processingFile || workerRef.current !== worker) {
        console.warn('[InquiryModal setupWorkerHandlers] 오래되었거나 일치하지 않는 워커/파일로부터 오류 수신. 무시됨.');
        worker.terminate();
        return;
      }
      console.error('[InquiryModal setupWorkerHandlers] 워커 ONERROR. ErrorEvent:', errorEvent);
      handleExcelValidationComplete({
        type: 'result', success: false, error: `워커 오류: ${errorEvent.message || '알 수 없는 워커 오류입니다.'}`,
        previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize: processingFile.size, isLargeFile: processingFile.size > (5 * 1024 * 1024)
      });
      setIsProcessing(false);
      console.log('[InquiryModal setupWorkerHandlers ONERROR] isProcessing을 FALSE로 설정.');
      clearWorkerAndTimeout();
    };
  }, [handleExcelValidationComplete, clearWorkerAndTimeout]);


  useEffect(() => {
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    console.log(`[InquiryModal useEffect_uploadedFile] 시작. uploadedFile status: ${uploadedFile?.status}, isProcessing: ${isProcessing}`);
    
    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
        console.log(`[InquiryModal useEffect_uploadedFile] 조건 충족: 파일 상태 'success'. ${uploadedFile.name}에 대한 워커 시작.`);
        
        if (workerRef.current) {
            console.warn('[InquiryModal useEffect_uploadedFile] 이전 워커가 존재합니다. 정리합니다.', workerRef.current);
            workerRef.current.terminate();
            workerRef.current = null;
        }
        if (timeoutRef.current) {
            console.warn('[InquiryModal useEffect_uploadedFile] 이전 타임아웃이 존재합니다. 해제합니다.', timeoutRef.current);
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        currentFileRef.current = uploadedFile.file; 

        setExcelValidationState(null); 
        setIsProcessing(true);
        console.log('[InquiryModal useEffect_uploadedFile] isProcessing을 TRUE로 설정.');

        if (uploadedFile.file.size > 10 * 1024 * 1024) { // 10MB
            // 토스트 기능 임시 주석 처리
            /*
            toast({
                title: "대용량 파일 처리 중",
                description: `파일 크기가 ${(uploadedFile.file.size / (1024*1024)).toFixed(1)}MB입니다. 처리 시간이 오래 걸릴 수 있습니다.`,
            });
            */
            console.log("대용량 파일 처리 중 토스트 (주석 처리됨)");
        }

        localWorkerInstance = createExcelWorker();
        if (!localWorkerInstance) {
            setIsProcessing(false);
            console.log('[InquiryModal useEffect_uploadedFile] 워커 생성 실패. isProcessing을 FALSE로 설정.');
            return; 
        }
        workerRef.current = localWorkerInstance; 
        setupWorkerHandlers(localWorkerInstance, uploadedFile.file);

        console.log('[InquiryModal useEffect_uploadedFile] 워커에 메시지 게시 (파일 포함):', uploadedFile.file.name);
        localWorkerInstance.postMessage({ file: uploadedFile.file } as WorkerParseRequest);

        localTimeoutId = setTimeout(() => {
            if (workerRef.current === localWorkerInstance && currentFileRef.current === uploadedFile.file) { 
                console.warn('[InquiryModal useEffect_uploadedFile] 워커 타임아웃 발생 (워커:', localWorkerInstance, ', 파일:', uploadedFile.file.name, ')');
                handleExcelValidationComplete({
                    type: 'result', success: false, error: `Excel 파일 처리 시간이 ${PROCESSING_TIMEOUT_MS / 1000}초를 초과했습니다.`,
                    previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                    fileSize: uploadedFile.file.size, isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024)
                });
                setIsProcessing(false); 
                console.log('[InquiryModal useEffect_uploadedFile 타임아웃] isProcessing을 FALSE로 설정.');
                clearWorkerAndTimeout(); 
            } else {
                console.log('[InquiryModal useEffect_uploadedFile] 오래되었거나 일치하지 않는 워커/파일에 대한 타임아웃. 무시됨.');
            }
        }, PROCESSING_TIMEOUT_MS);
        timeoutRef.current = localTimeoutId; 

    } else if (uploadedFile && uploadedFile.status === 'uploading') {
        console.log(`[InquiryModal useEffect_uploadedFile] 파일 상태 "${uploadedFile.status}". 'success' 대기 중. 이전 유효성 검사 상태 해제됨.`);
        setExcelValidationState(null);
    } else if (uploadedFile && uploadedFile.status === 'error') {
        console.log(`[InquiryModal useEffect_uploadedFile] 파일 상태 'error' (드롭존에서). 오류:`, uploadedFile.errorMessage);
        setExcelValidationState({ error: uploadedFile.errorMessage || "파일 업로드 실패.", isValid: false, hasData: false, headersValid: false });
        setIsProcessing(false);
        clearWorkerAndTimeout();
    } else if (!uploadedFile) { 
        console.log('[InquiryModal useEffect_uploadedFile] 파일 없음 (파일 제거됨). 정리 중.');
        setExcelValidationState(null);
        setIsProcessing(false);
        clearWorkerAndTimeout();
    }

    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] 이 효과 실행 정리. 로컬 워커 종료 (이 실행의 워커인 경우): ${localWorkerInstance} 로컬 타임아웃 ID 해제: ${localTimeoutId}`);
      if (localWorkerInstance) {
        localWorkerInstance.terminate();
      }
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
    };
  }, [uploadedFile, createExcelWorker, setupWorkerHandlers, handleExcelValidationComplete, clearWorkerAndTimeout, /* toast */]);


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange 호출됨:", newFile);
    currentFileRef.current = newFile?.file || null; 
    setUploadedFile(newFile);
  }, []);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: open을 ${isOpen}(으)로 설정.`);
    if (typeof console.trace === 'function' && !isOpen) {
        console.trace("[InquiryModal] handleModalOpenChange - 모달 닫기 추적");
    }
    if (!isOpen) {
      console.log("[InquiryModal] 모달 닫힘. 상태 초기화 및 워커/타임아웃 정리.");
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
    return () => {
      console.log("[InquiryModal] 컴포넌트 언마운트 중. 워커/타임아웃 최종 정리 보장.");
      clearWorkerAndTimeout();
    };
  }, [clearWorkerAndTimeout]);

  const handleSubmitInquiry = useCallback(async () => {
    console.log("[InquiryModal handleSubmitInquiry] 클릭됨.");
    // 토스트 기능 임시 주석 처리
    /*
    if (!user) {
      toast({ title: "인증 오류", description: "문의를 제출하려면 로그인해야 합니다.", variant: "destructive" });
      return;
    }
    */
    if (!user) {
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
        // 토스트 기능 임시 주석 처리
        /*
        toast({
          title: "제출 불가",
          description: excelValidationState?.error || "유효한 Excel 파일을 업로드하고 데이터가 있는지 확인하거나, 헤더 다음에 데이터가 있는지 확인하세요.",
          variant: "destructive",
        });
        */
        console.error("제출 불가 (Excel):", excelValidationState?.error || "유효한 Excel 파일을 업로드하고 데이터가 있는지 확인하거나, 헤더 다음에 데이터가 있는지 확인하세요.");
        setIsSubmitting(false);
        return;
      }
    } else if (activeTab === 'direct') {
      const gridData = directEntryTabRef.current?.getGridData();
      if (gridData && gridData.length > 0) {
         dataToProcess = gridData;
      } else {
        // 토스트 기능 임시 주석 처리
        // toast({ title: "데이터 없음", description: "제출할 데이터를 그리드에 입력하세요.", variant: "destructive" });
        console.error("데이터 없음 (직접 입력): 제출할 데이터를 그리드에 입력하세요.");
        setIsSubmitting(false);
        return;
      }
    }

    if (dataToProcess.length === 0) {
      // 토스트 기능 임시 주석 처리
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
        status: "Pending", 
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

    console.log("[InquiryModal handleSubmitInquiry] 문서 제출 시도:", JSON.stringify(inquiryDoc).substring(0, 500) + "...");

    try {
      await addDoc(collection(firestore, "inquiries"), inquiryDoc);
      // 토스트 기능 임시 주석 처리
      /*
      toast({
        title: "문의 제출 완료!",
        description: `성공적으로 ${dataRowsToSubmit.length}개 행을 제출했습니다.`,
      });
      */
      console.log(`문의 제출 완료! 성공적으로 ${dataRowsToSubmit.length}개 행을 제출했습니다.`);
      handleModalOpenChange(false);
    } catch (error: any) {
      console.error("Firestore에 문의 제출 오류:", error);
      // 토스트 기능 임시 주석 처리
      /*
      toast({
        title: "제출 오류",
        description: `문의를 제출할 수 없습니다: ${error.message || '알 수 없는 Firestore 오류입니다.'}`,
        variant: "destructive",
      });
      */
       console.error(`문의 제출 오류: ${error.message || '알 수 없는 Firestore 오류입니다.'}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [activeTab, excelValidationState, uploadedFile?.name, user, /*toast,*/ handleModalOpenChange]);

  const isSubmitDisabled = useMemo(() => {
    if (isSubmitting || isProcessing) return true;
    if (activeTab === 'excel') {
      return !excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData;
    }
    if (activeTab === 'direct') {
      return false;
    }
    return true;
  }, [isSubmitting, isProcessing, activeTab, excelValidationState]);
  
  console.log(`[InquiryModal] 최종 렌더링 상태: {isProcessing: ${isProcessing}, uploadedFileStatus: ${uploadedFile?.status}, excelError: ${excelValidationState?.error}, excelHasData: ${excelValidationState?.hasData}}`);

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent
        className="max-w-[1000px] w-[95vw] sm:w-[90vw] md:w-[1000px] p-0 data-[state=open]:h-auto sm:h-[calc(100vh-100px)] sm:max-h-[700px] flex flex-col"
        onInteractOutside={(event) => {
          if (isProcessing || isSubmitting) {
            console.log("[InquiryModal DialogContent] isProcessing 또는 isSubmitting으로 인해 onInteractOutside 방지됨.");
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="p-6 pb-2 text-center">
          <DialogTitle className="text-2xl">문의 제출</DialogTitle>
          <DialogDescription>
            Excel 파일을 업로드하거나 직접 정보를 입력하세요.
          </DialogDescription>
           {isProcessing && (
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
            <TabsTrigger value="excel" disabled={isSubmitting || isProcessing}>Excel 업로드</TabsTrigger>
            <TabsTrigger value="direct" disabled={isSubmitting || isProcessing}>직접 입력</TabsTrigger>
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
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            문의 제출
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
