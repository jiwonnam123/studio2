
"use client";

import type React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { UploadCloud, Loader2, AlertTriangle, FileText, XCircle, CheckCircle2 } from 'lucide-react';
import type { UploadedFile } from '@/types/inquiry';
import { cn } from '@/lib/utils';

const acceptFileTypes: Accept = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
};

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface FileUploadZoneProps {
  onFileAccepted: (file: UploadedFile | null) => void;
  disabled?: boolean; // 부모로부터 받는 전역 비활성화 상태
}

export function FileUploadZone({ onFileAccepted, disabled = false }: FileUploadZoneProps) {
  const [internalError, setInternalError] = useState<string | null>(null);
  // processingTimeoutRef는 더 이상 FileUploadZone에서 관리하지 않음

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      console.log("[FileUploadZone] onDrop called. Accepted:", acceptedFiles.length, "Rejected:", fileRejections.length, "Parent Disabled:", disabled);
      setInternalError(null); // 이전 오류 메시지 초기화

      if (disabled) {
        console.log("[FileUploadZone] Drop ignored because component is disabled by parent.");
        return;
      }

      if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const firstError = rejection.errors[0];
        let errorMessage = "Invalid file.";
        if (firstError.code === 'file-too-large') {
          errorMessage = `File is too large. Max size is ${MAX_FILE_SIZE_MB}MB.`;
        } else if (firstError.code === 'file-invalid-type') {
          errorMessage = "Invalid file type. Please upload .xlsx, .xls, or .csv files.";
        } else {
          errorMessage = firstError.message || "File rejected.";
        }
        
        setInternalError(errorMessage);
        const errorFile: UploadedFile = {
          file: rejection.file, // fileRejections의 file은 File 객체일 수 있음
          name: rejection.file.name,
          size: rejection.file.size,
          type: rejection.file.type,
          status: 'error', // 드롭존 수준의 오류
          errorMessage: errorMessage,
        };
        console.log("[FileUploadZone] Calling onFileAccepted with DROPZONE ERROR file:", errorFile.name, errorFile.errorMessage);
        onFileAccepted(errorFile); // 부모에게 오류 상태 전달
        return;
      }

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        const successFile: UploadedFile = {
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'success', // 즉시 'success'로 설정하여 부모가 바로 처리 시작하도록 함
        };
        console.log("[FileUploadZone] Calling onFileAccepted with SUCCESS file (immediately):", successFile.name, successFile.status);
        onFileAccepted(successFile);
      } else {
        console.log("[FileUploadZone] No files to process after drop.");
        // 필요하다면 onFileAccepted(null) 호출
      }
    },
    [onFileAccepted, disabled] 
  );

  const dropzoneResult = useDropzone({
    onDrop,
    accept: acceptFileTypes,
    maxSize: MAX_FILE_SIZE_BYTES, 
    multiple: false,
    disabled: disabled, // 부모로부터 받은 disabled 상태 사용
  });

  if (!dropzoneResult || typeof dropzoneResult.getRootProps !== 'function') {
    console.error("[FileUploadZone] Error: useDropzone did not return a valid getRootProps function.");
    return (
      <div className="flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg border-destructive bg-destructive/10 p-4">
        <AlertTriangle className="w-10 h-10 mb-3 text-destructive" />
        <p className="text-sm font-semibold text-destructive">Dropzone Initialization Error</p>
        <p className="text-xs text-destructive text-center mt-1">Could not initialize the file upload area. Please try refreshing the page.</p>
      </div>
    );
  }

  const { getRootProps, getInputProps, isDragActive } = dropzoneResult;

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg cursor-pointer transition-colors",
        isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/70",
        disabled ? "cursor-default opacity-70 bg-muted/50 !border-muted" : "" // 전역 disabled 시 스타일 명확화
      )}
    >
      <input {...getInputProps()} />
      {disabled ? ( // 전역 isProcessing (부모로부터 받은 disabled) 상태일 때
        <>
          <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
          <p className="text-sm text-primary">Processing file...</p> 
        </>
      ) : (
        <>
          <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
          {isDragActive ? (
            <p className="text-lg font-semibold text-primary">Drop the file here ...</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold text-primary">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">XLSX, XLS, or CSV (MAX. {MAX_FILE_SIZE_MB}MB)</p>
            </>
          )}
        </>
      )}
      {internalError && !disabled && ( // 내부 드롭존 오류 메시지 (전역 처리 중이 아닐 때만 표시)
        <div className="mt-2 text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3"/> {internalError}
        </div>
      )}
    </div>
  );
}
