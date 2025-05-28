
"use client";

import type React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { UploadedFile } from '@/types/inquiry';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFileAccepted: (file: UploadedFile | null) => void;
  isProcessingGlobal?: boolean; // Optional prop to disable dropzone if parent is busy
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export function FileUploadZone({ onFileAccepted, isProcessingGlobal = false }: FileUploadZoneProps) {
  const [internalFile, setInternalFile] = useState<UploadedFile | null>(null);
  const [internalProcessing, setInternalProcessing] = useState(false); // For dropzone's own "upload" simulation
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    console.log("[FileUploadZone] onDrop called. Accepted:", acceptedFiles.length, "Rejected:", fileRejections.length);
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
    }
    setInternalProcessing(true); // Start internal processing

    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      const firstError = rejection.errors[0];
      let errorMessage = "Invalid file.";
      if (firstError.code === 'file-too-large') {
        errorMessage = `File is too large. Max size is ${formatBytes(5 * 1024 * 1024)}.`;
      } else if (firstError.code === 'file-invalid-type') {
        errorMessage = "Invalid file type. Please upload .xlsx, .xls, or .csv files.";
      }
      const errorFile: UploadedFile = {
        file: rejection.file,
        name: rejection.file.name,
        size: rejection.file.size,
        type: rejection.file.type,
        status: 'error',
        errorMessage: errorMessage,
      };
      setInternalFile(errorFile);
      onFileAccepted(errorFile); // Notify parent immediately of error
      setInternalProcessing(false);
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const uploadingFile: UploadedFile = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading',
      };
      setInternalFile(uploadingFile);
      onFileAccepted(uploadingFile); // Notify parent: 'uploading'

      // Simulate upload process then transition to 'success' for parent to handle
      uploadTimeoutRef.current = setTimeout(() => {
        console.log("[FileUploadZone] setTimeout: Simulating upload complete. Setting status to 'success'.");
        const successFile: UploadedFile = { ...uploadingFile, status: 'success' };
        setInternalFile(successFile);
        onFileAccepted(successFile); // Notify parent: 'success'
        setInternalProcessing(false);
      }, 500); // Reduced delay, parent handles actual long processing
    } else {
      setInternalFile(null);
      onFileAccepted(null);
      setInternalProcessing(false);
    }
  }, [onFileAccepted]);

  const removeFile = useCallback(() => {
    console.log("[FileUploadZone] removeFile called.");
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
    }
    setInternalFile(null);
    onFileAccepted(null);
    setInternalProcessing(false);
  }, [onFileAccepted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      // 'text/csv': ['.csv'], // CSV might need different parsing logic in worker
    },
    maxSize: 5 * 1024 * 1024, // 5MB limit
    disabled: internalProcessing || isProcessingGlobal,
  });
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
    };
  }, []);

  if (internalFile && internalFile.status !== 'idle' && !isProcessingGlobal) {
     // This UI shows when a file is selected/processing internally by dropzone,
     // OR if parent is NOT globally processing but there's an internalFile
    return (
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                {internalFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(internalFile.size)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {internalFile.status === 'uploading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
            {internalFile.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {internalFile.status === 'error' && <XCircle className="w-5 h-5 text-destructive" />}
            <Button variant="ghost" size="icon" onClick={removeFile} disabled={internalProcessing || isProcessingGlobal}>
              <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
        {internalFile.status === 'uploading' && (
          <Progress value={50} className="h-1 mt-2" />
        )}
        {internalFile.status === 'error' && internalFile.errorMessage && (
          <p className="text-xs text-destructive mt-1 pt-2 border-t border-destructive/20">{internalFile.errorMessage}</p>
        )}
        {internalFile.status === 'success' && (
          <p className="text-xs text-green-600 mt-1">File ready for validation and preview.</p>
        )}
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg cursor-pointer transition-colors",
        isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/70",
        (internalProcessing || isProcessingGlobal) ? "cursor-default opacity-70 bg-muted/50" : ""
      )}
    >
      <input {...getInputProps()} />
      {(internalProcessing || isProcessingGlobal) ? (
        <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
      ) : (
        <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
      )}
      
      {isDragActive ? (
        <p className="text-lg font-semibold text-primary">Drop the file here ...</p>
      ) : (internalProcessing || isProcessingGlobal) ? (
        <p className="text-sm text-primary">Processing file...</p>
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
