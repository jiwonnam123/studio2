
"use client";

import type React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { UploadCloud, Loader2 } from 'lucide-react';
import type { UploadedFile } from '@/types/inquiry';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFileAccepted: (file: UploadedFile | null) => void;
  disabled?: boolean;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const acceptFileTypes: Accept = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  // CSV는 현재 워커에서 명시적으로 처리하지 않으므로, 필요하다면 워커 로직 수정 및 여기에 추가
  // 'text/csv': ['.csv'], 
};

export function FileUploadZone({ onFileAccepted, disabled = false }: FileUploadZoneProps) {
  const [isBrieflyProcessing, setIsBrieflyProcessing] = useState(false);
  const [currentFileMetaForDisplay, setCurrentFileMetaForDisplay] = useState<{name: string, size: number} | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      console.log("[FileUploadZone] onDrop called. Accepted:", acceptedFiles.length, "Rejected:", fileRejections.length, "Parent Disabled:", disabled);
      if (disabled) {
        console.log("[FileUploadZone] Drop ignored because component is disabled by parent.");
        return;
      }

      setIsBrieflyProcessing(true);
      setCurrentFileMetaForDisplay(null);

      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }

      if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const firstError = rejection.errors[0];
        let errorMessage = "Invalid file.";
        if (firstError.code === 'file-too-large') {
          errorMessage = `File is too large. Max size is ${formatBytes(5 * 1024 * 1024)}.`;
        } else if (firstError.code === 'file-invalid-type') {
          errorMessage = "Invalid file type. Please upload .xlsx or .xls files.";
        }
        const errorFile: UploadedFile = {
          file: rejection.file,
          name: rejection.file.name,
          size: rejection.file.size,
          type: rejection.file.type,
          status: 'error',
          errorMessage: errorMessage,
        };
        console.log("[FileUploadZone] Calling onFileAccepted with error file:", errorFile.name);
        onFileAccepted(errorFile); // Use onFileAccepted
        setIsBrieflyProcessing(false);
        return;
      }

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setCurrentFileMetaForDisplay({ name: file.name, size: file.size });
        const uploadingFile: UploadedFile = {
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'uploading',
        };
        console.log(
          '[FileUploadZone] Calling onFileAccepted (1) with uploadingFile:',
          uploadingFile.name,
          uploadingFile.status
        );
        onFileAccepted(uploadingFile); // Use onFileAccepted

        processingTimeoutRef.current = setTimeout(() => {
          const successFile: UploadedFile = { ...uploadingFile, status: 'success' };
          console.log(
            '[FileUploadZone] setTimeout: Calling onFileAccepted (2) with successFile:',
            successFile.name,
            successFile.status
          );
          onFileAccepted(successFile); // Use onFileAccepted
          setIsBrieflyProcessing(false);
        }, 100); // Shortened timeout for quicker 'success' state if needed
      } else {
        console.log("[FileUploadZone] No files accepted or other issue.");
        onFileAccepted(null); // Use onFileAccepted
        setIsBrieflyProcessing(false);
      }
    },
    [onFileAccepted, disabled]
  );
  
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, []);

  const dropzoneResult = useDropzone({
    onDrop,
    accept: acceptFileTypes,
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
    disabled: disabled || isBrieflyProcessing,
  });

  if (!dropzoneResult || typeof dropzoneResult.getRootProps !== 'function') {
    console.error("[FileUploadZone] Error: useDropzone did not return a valid getRootProps function. Dropzone result:", dropzoneResult);
    return (
      <div className="flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-semibold text-destructive">Dropzone Initialization Error</p>
        <p className="text-xs text-destructive text-center mt-1">Could not initialize the file upload area. Please try refreshing the page.</p>
      </div>
    );
  }
  
  const {
    getRootProps,
    getInputProps,
    isDragActive,
  } = dropzoneResult;

  if (disabled && !isBrieflyProcessing) {
     return null; 
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg cursor-pointer transition-colors",
        isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/70",
        (isBrieflyProcessing || (disabled && !isBrieflyProcessing)) ? "cursor-default opacity-70 bg-muted/50" : ""
      )}
    >
      <input {...getInputProps()} />
      {(isBrieflyProcessing) ? (
        <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
      ) : (
        <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
      )}
      
      {isDragActive ? (
        <p className="text-lg font-semibold text-primary">Drop the file here ...</p>
      ) : (isBrieflyProcessing) ? (
        <>
          <p className="text-sm text-primary">Preparing file...</p>
          {currentFileMetaForDisplay && <p className="text-xs text-muted-foreground">{currentFileMetaForDisplay.name}</p>}
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            <span className="font-semibold text-primary">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-muted-foreground">XLSX or XLS (MAX. 5MB)</p>
        </>
      )}
    </div>
  );
}
