
"use client";

import type React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle, FileText, XCircle } from 'lucide-react';
import type { UploadedFile } from '@/types/inquiry';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadZoneProps {
  onFileAccepted: (file: UploadedFile | null) => void;
  disabled?: boolean;
  parentIsProcessing?: boolean; // To prevent interaction when parent is busy
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
  // 'text/csv': ['.csv'], // CSV는 현재 워커에서 명시적으로 처리하지 않음
};

export function FileUploadZone({ onFileAccepted, disabled = false, parentIsProcessing = false }: FileUploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      console.log("[FileUploadZone] onDrop called. Accepted:", acceptedFiles.length, "Rejected:", fileRejections.length, "Parent Disabled:", disabled, "Parent Processing:", parentIsProcessing);
      if (disabled || parentIsProcessing) {
        console.log("[FileUploadZone] Drop ignored because component is disabled or parent is processing.");
        return;
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
        console.log("[FileUploadZone] Calling onFileAccepted with ERROR file:", errorFile.name, errorFile.errorMessage);
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
          status: 'success', // Immediately set to 'success' to trigger parent processing
        };
        console.log("[FileUploadZone] Calling onFileAccepted with SUCCESS file:", successFile.name, successFile.status);
        onFileAccepted(successFile);
      } else {
        console.log("[FileUploadZone] No files to process after drop (neither accepted nor rejected with specific error).");
        onFileAccepted(null); // Should ideally not happen if dropzone is active
      }
    },
    [onFileAccepted, disabled, parentIsProcessing]
  );

  const dropzoneResult = useDropzone({
    onDrop,
    accept: acceptFileTypes,
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
    disabled: disabled || parentIsProcessing, // Disable dropzone if parent is processing
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

  const { getRootProps, getInputProps, isDragActive } = dropzoneResult;

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg cursor-pointer transition-colors",
        isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/70",
        (disabled || parentIsProcessing) ? "cursor-default opacity-70 bg-muted/50" : ""
      )}
    >
      <input {...getInputProps()} />
      {(parentIsProcessing) ? ( // Show loader if parent is processing (e.g., worker busy)
        <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
      ) : (
        <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
      )}

      {isDragActive ? (
        <p className="text-lg font-semibold text-primary">Drop the file here ...</p>
      ) : (parentIsProcessing) ? (
        <p className="text-sm text-primary">Parent processing...</p> // This message might not be seen if parent hides this zone
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
