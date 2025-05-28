
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
import { DirectEntryTab, type DirectEntryTabHandles } from './DirectEntryTab';
import type { UploadedFile, ExcelValidationResult, WorkerParseResponse, WorkerParseRequest } from '@/types/inquiry';
import { SubmittedInquiry, SubmittedInquiryDataRow } from '@/types';
// import { useToast as useActualToast } from '@/hooks/use-toast'; // 실제 useToast 훅 임포트 (테스트 위해 주석 처리)
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase'; 
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'; 

const PROCESSING_TIMEOUT_MS = 30000; 

interface InquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveTab = 'excel' | 'direct';

const dummyToast = (options: any) => {
  console.warn("DUMMY TOAST (실제 토스트 비활성화됨):", options);
  return { id: '', dismiss: () => {}, update: () => {} };
};

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
  // const toastHookResult = useActualToast(); // 테스트 위해 주석 처리
  // const toast = toastHookResult?.toast || dummyToast; // 테스트 위해 주석 처리
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
  
  const handleExcelValidationComplete = useCallback((result: WorkerParseResponse) => {
    const newValidationResult: ExcelValidationResult = {
      isValid: result.success || false,
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
    console.log("[InquiryModal handleExcelValidationComplete] Received worker result. Updating excelValidationState:", newValidationResult);
    setExcelValidationState(newValidationResult);
  }, []); 

  const createExcelWorker = useCallback((): Worker | null => {
    console.log('[InquiryModal createExcelWorker] Attempting to create worker.');
    try {
      if (typeof Worker === 'undefined') {
        console.error('[ERROR InquiryModal createExcelWorker] Worker not supported.');
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
      console.error('[ERROR InquiryModal createExcelWorker] Worker creation failed:', error);
       handleExcelValidationComplete({
          type: 'result', success: false, error: 'Excel processing environment could not be initialized.',
          previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
          fileSize: currentFileRef.current?.size || 0, 
          isLargeFile: (currentFileRef.current?.size || 0) > 5 * 1024 * 1024,
        });
      return null;
    }
  }, [handleExcelValidationComplete]);

  useEffect(() => {
    console.log(`[InquiryModal useEffect_uploadedFile] START. Status: ${uploadedFile?.status}, Name: ${uploadedFile?.name}`);
    
    let localWorkerInstance: Worker | null = null;
    let localTimeoutId: NodeJS.Timeout | null = null;

    if (uploadedFile && uploadedFile.file && uploadedFile.status === 'success') {
        console.log(`[InquiryModal useEffect_uploadedFile] Entered SUCCESS block for file: ${uploadedFile.name}.`);
        
        // 이전 워커/타임아웃이 있다면 명확히 정리 (새로운 파일 처리를 위해)
        if (workerRef.current) {
            console.log('[InquiryModal useEffect_uploadedFile] SUCCESS: Clearing PREVIOUS active workerRef.');
            workerRef.current.terminate();
            workerRef.current = null;
        }
        if (timeoutRef.current) {
            console.log('[InquiryModal useEffect_uploadedFile] SUCCESS: Clearing PREVIOUS active timeoutRef.');
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        currentFileRef.current = uploadedFile.file; 
        setExcelValidationState(null); 
        setIsProcessing(true); 
        console.log('[InquiryModal useEffect_uploadedFile] SUCCESS: Set isProcessing to TRUE for:', currentFileRef.current?.name);
      
        localWorkerInstance = createExcelWorker();

        if (!localWorkerInstance) {
            console.error("[InquiryModal useEffect_uploadedFile] SUCCESS: Failed to create worker. Resetting isProcessing.");
            setIsProcessing(false); // 워커 생성 실패 시 isProcessing false로 설정
            currentFileRef.current = null;
            return; 
        }
      
        workerRef.current = localWorkerInstance; 

        localWorkerInstance.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
            console.log('[InquiryModal worker.onmessage] Received message. CurrentFileRef:', currentFileRef.current?.name, 'File at message:', uploadedFile.file.name);
            // 현재 활성화된 워커 및 처리중인 파일과 일치하는지 확인
            if (workerRef.current === localWorkerInstance && currentFileRef.current === uploadedFile.file) {
                if (event.data.type === 'progress') {
                    console.log(`[InquiryModal worker.onmessage] Worker PROGRESS: Stage: ${event.data.stage}, Progress: ${event.data.progress}%`);
                    return; 
                }
                console.log('[InquiryModal worker.onmessage] Processing RESULT from worker. Data:', event.data);
                handleExcelValidationComplete(event.data);
                setIsProcessing(false); 
                console.log('[InquiryModal worker.onmessage] Set isProcessing to FALSE.');
                workerRef.current = null; 
                if (timeoutRef.current === localTimeoutId) { 
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            } else {
                 console.warn('[InquiryModal worker.onmessage] Received message from STALE or MISMATCHED worker/file. IGNORED.');
            }
        };

        localWorkerInstance.onerror = (errorEvent) => {
            console.error('[InquiryModal worker.onerror] Worker ERROR. CurrentFileRef:', currentFileRef.current?.name, 'File at error:', uploadedFile.file.name, 'ErrorEvent:', errorEvent);
            if (workerRef.current === localWorkerInstance && currentFileRef.current === uploadedFile.file) {
                handleExcelValidationComplete({
                  type: 'result', success: false, error: `Worker error: ${errorEvent.message || 'Unknown worker error.'}`,
                  previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                  fileSize: uploadedFile.file.size, isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024)
                });
                setIsProcessing(false);
                console.log('[InquiryModal worker.onerror] Set isProcessing to FALSE.');
                workerRef.current = null; 
                if (timeoutRef.current === localTimeoutId) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            } else {
                console.warn('[InquiryModal worker.onerror] Received error from STALE or MISMATCHED worker/file. IGNORED.');
            }
        };
      
        console.log('[InquiryModal useEffect_uploadedFile] SUCCESS: Posting message to worker with file:', uploadedFile.file.name);
        localWorkerInstance.postMessage({ file: uploadedFile.file } as WorkerParseRequest);

        localTimeoutId = setTimeout(() => {
            console.warn('[InquiryModal useEffect_uploadedFile] Worker TIMEOUT. CurrentFileRef:', currentFileRef.current?.name, 'File at timeout:', uploadedFile.file?.name);
            if (workerRef.current === localWorkerInstance && currentFileRef.current === uploadedFile.file) { 
                handleExcelValidationComplete({
                    type: 'result', success: false, error: `Excel file processing timed out (${PROCESSING_TIMEOUT_MS / 1000} seconds).`,
                    previewData: null, fullData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
                    fileSize: uploadedFile.file.size, isLargeFile: uploadedFile.file.size > (5 * 1024 * 1024)
                });
                setIsProcessing(false);
                console.log('[InquiryModal useEffect_uploadedFile TIMEOUT] Set isProcessing to FALSE.');
                workerRef.current = null; 
                timeoutRef.current = null; 
            } else {
                 console.log('[InquiryModal useEffect_uploadedFile] Timeout for STALE or MISMATCHED worker/file. IGNORED.');
            }
        }, PROCESSING_TIMEOUT_MS);
        timeoutRef.current = localTimeoutId; 

    } else if (uploadedFile && uploadedFile.status === 'uploading') {
      // 'uploading' 상태는 FileUploadZone에서 'success'로 빠르게 전환되므로,
      // InquiryModal에서는 이 상태에 대한 별도 처리를 최소화하거나,
      // setExcelValidationState(null) 정도만 수행합니다.
      console.log(`[InquiryModal useEffect_uploadedFile] File status is "uploading" for: ${uploadedFile.name}. Waiting for 'success'.`);
      setExcelValidationState(null); // 이전 결과만 지움
    } else { // No file, or file status is 'error' from dropzone
      console.log(`[InquiryModal useEffect_uploadedFile] File removed or initial error from dropzone. Status: ${uploadedFile?.status}. Cleaning up.`);
      if (workerRef.current) { 
        console.log('[InquiryModal useEffect_uploadedFile] Clearing active worker.');
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) { 
         console.log('[InquiryModal useEffect_uploadedFile] Clearing active timeout.');
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsProcessing(false);
      console.log('[InquiryModal useEffect_uploadedFile NO FILE/ERROR] Set isProcessing to FALSE.');
      
      if (uploadedFile?.status === 'error' && uploadedFile.errorMessage) {
        setExcelValidationState({ isValid: false, error: uploadedFile.errorMessage, hasData: false, headersValid: false, fullData: null, previewData: null });
      } else if (!uploadedFile) {
         setExcelValidationState(null);
      }
      currentFileRef.current = null;
    }

    return () => {
      console.log(`[InquiryModal useEffect_uploadedFile] CLEANUP for effect run related to file: ${uploadedFile?.name} (status: ${uploadedFile?.status}). Terminating localWorkerInstance: ${localWorkerInstance}`);
      if (localWorkerInstance) {
        localWorkerInstance.terminate();
      }
      if (localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
    };
  }, [uploadedFile, createExcelWorker, handleExcelValidationComplete]); 


  const handleFileChange = useCallback((newFile: UploadedFile | null) => {
    console.log("[InquiryModal] handleFileChange called with newFile:", newFile);
    setUploadedFile(newFile); 
  }, []);


  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    console.log(`[InquiryModal] handleModalOpenChange: Setting open to ${isOpen}.`);
    if (typeof console.trace === 'function' && !isOpen) {
        // console.trace("[InquiryModal] handleModalOpenChange - Trace for modal close");
    }
    if (!isOpen) {
      console.log("[InquiryModal] Modal closing. Resetting all states and cleaning worker/timeout.");
      setUploadedFile(null); 
      setExcelValidationState(null);
      setIsProcessing(false); 
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      currentFileRef.current = null;
      setActiveTab('excel');
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);


  useEffect(() => {
    return () => {
      console.log("[InquiryModal] Component UNMOUNTING. Ensuring final cleanup of worker/timeout.");
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);


  const handleSubmitInquiry = useCallback(async () => {
    console.log("[InquiryModal handleSubmitInquiry] Clicked.");
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to submit an inquiry.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true); 

    let dataRowsToSubmit: SubmittedInquiryDataRow[] = [];
    let sourceForDB: 'excel' | 'direct' = activeTab;
    let fileNameForDB: string | undefined = undefined;

    if (activeTab === 'excel') {
      if (excelValidationState && excelValidationState.isValid && excelValidationState.hasData && excelValidationState.fullData) {
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
      const gridData = directEntryTabRef.current?.getGridData(); 
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
      console.log("[InquiryModal handleSubmitInquiry] Submitting to Firestore:", { ...inquiryDoc, submittedAt: "SERVER_TIMESTAMP" });
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
      setIsSubmitting(false);
    }
  }, [activeTab, excelValidationState, uploadedFile?.name, user, toast, handleModalOpenChange]);
  
  const isExcelSubmitDisabled = () => {
    if (isSubmitting || isProcessing) return true; 
    if (!excelValidationState || !excelValidationState.isValid || !excelValidationState.hasData || !excelValidationState.fullData) {
      return true;
    }
    return false;
  };

  const isDirectSubmitDisabled = () => {
    return isSubmitting || isProcessing; 
  };
  
  // console.log(`[InquiryModal] Rendering. isProcessing: ${isProcessing} uploadedFile status: ${uploadedFile?.status}`);

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
          {isProcessing && activeTab === 'excel' && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary pt-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              파일 처리 중... ({uploadedFile?.file ? ((uploadedFile.file.size || 0) / 1024).toFixed(1) : 'N/A'}KB)
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
