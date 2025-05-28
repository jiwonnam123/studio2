
"use client";

import type React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { UploadCloud, Loader2, AlertTriangle } from 'lucide-react';
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
  disabled?: boolean; 
}

export function FileUploadZone({ onFileAccepted, disabled = false }: FileUploadZoneProps) {
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      console.log("[FileUploadZone] onDrop 호출됨. Accepted:", acceptedFiles.length, "Rejected:", fileRejections.length, "Parent Disabled:", disabled);
      
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }

      if (disabled) {
        console.log("[FileUploadZone] 부모에 의해 비활성화되어 드롭 무시됨.");
        return;
      }

      if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const firstError = rejection.errors[0];
        let errorMessage = "유효하지 않은 파일입니다.";
        if (firstError.code === 'file-too-large') {
          errorMessage = `파일이 너무 큽니다. 최대 크기는 ${MAX_FILE_SIZE_MB}MB입니다.`;
        } else if (firstError.code === 'file-invalid-type') {
          errorMessage = "잘못된 파일 형식입니다. .xlsx, .xls, 또는 .csv 파일을 업로드하세요.";
        } else {
          errorMessage = firstError.message || "파일이 거부되었습니다.";
        }
        
        const errorFile: UploadedFile = {
          file: rejection.file,
          name: rejection.file.name,
          size: rejection.file.size,
          type: rejection.file.type,
          status: 'error', 
          errorMessage: errorMessage,
        };
        console.log("[FileUploadZone] onFileAccepted 호출 (드롭존 오류 파일):", errorFile.name, errorFile.errorMessage);
        onFileAccepted(errorFile);
        return;
      }

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        const successFile: UploadedFile = {
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'success', 
        };
        console.log("[FileUploadZone] onFileAccepted 호출 (성공 파일 - 즉시):", successFile.name, successFile.status);
        onFileAccepted(successFile);
      } else {
        console.log("[FileUploadZone] 드롭 후 처리할 파일 없음.");
      }
    },
    [onFileAccepted, disabled] 
  );

  const dropzoneResult = useDropzone({
    onDrop,
    accept: acceptFileTypes,
    maxSize: MAX_FILE_SIZE_BYTES, 
    multiple: false,
    disabled: disabled, 
  });

  if (!dropzoneResult || typeof dropzoneResult.getRootProps !== 'function') {
    console.error("[FileUploadZone] 오류: useDropzone이 유효한 getRootProps 함수를 반환하지 않음.");
    return (
      <div className="flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg border-destructive bg-destructive/10 p-4">
        <AlertTriangle className="w-10 h-10 mb-3 text-destructive" />
        <p className="text-sm font-semibold text-destructive">드롭존 초기화 오류</p>
        <p className="text-xs text-destructive text-center mt-1">파일 업로드 영역을 초기화할 수 없습니다. 페이지를 새로고침해 주세요.</p>
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
        disabled ? "cursor-default opacity-70 bg-muted/50 !border-muted" : "" 
      )}
    >
      <input {...getInputProps()} />
      {disabled ? ( 
        <>
          <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
          <p className="text-sm text-primary">파일 처리 중...</p> 
        </>
      ) : (
        <>
          <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
          {isDragActive ? (
            <p className="text-lg font-semibold text-primary">여기에 파일을 드롭하세요...</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold text-primary">클릭하여 업로드</span> 또는 드래그 앤 드롭하세요
              </p>
              <p className="text-xs text-muted-foreground">XLSX, XLS, 또는 CSV (최대 {MAX_FILE_SIZE_MB}MB)</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
