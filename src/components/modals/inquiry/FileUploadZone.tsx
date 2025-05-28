
"use client";

import type React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
// Button and Progress are not used directly here if UI is minimal
import type { UploadedFile } from '@/types/inquiry';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFileAccepted: (file: UploadedFile | null) => void;
  isProcessingGlobal?: boolean; 
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
  const [isDropzoneBrieflyProcessing, setIsDropzoneBrieflyProcessing] = useState(false); 
  const [currentFileMetaForDisplay, setCurrentFileMetaForDisplay] = useState<{name: string, size: number} | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    console.log("[FileUploadZone] onDrop. Accepted:", acceptedFiles.length, "Rejected:", fileRejections.length);
    
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
    }
    setIsDropzoneBrieflyProcessing(true); 

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
      setCurrentFileMetaForDisplay({name: errorFile.name, size: errorFile.size});
      console.log("[FileUploadZone] Calling onFileAccepted (1) with error file:", errorFile.name, errorFile.status);
      onFileAccepted(errorFile); 
      setIsDropzoneBrieflyProcessing(false);
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setCurrentFileMetaForDisplay({name: file.name, size: file.size});
      const uploadingFile: UploadedFile = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading', 
      };
      console.log("[FileUploadZone] Calling onFileAccepted (1) with uploadingFile:", uploadingFile.name, uploadingFile.status);
      onFileAccepted(uploadingFile); 

      uploadTimeoutRef.current = setTimeout(() => {
        // Ensure we are still processing the same file conceptually, though a new object is created
        if (currentFileMetaForDisplay && currentFileMetaForDisplay.name === file.name) {
            const successFile: UploadedFile = { ...uploadingFile, status: 'success' };
            console.log("[FileUploadZone] setTimeout: Calling onFileAccepted (2) with successFile:", successFile.name, successFile.status);
            onFileAccepted(successFile); 
        } else {
            console.log("[FileUploadZone] setTimeout: File changed before 'success' state could be sent for:", file.name);
        }
        setIsDropzoneBrieflyProcessing(false); 
      }, 500); 
    } else {
      console.log("[FileUploadZone] No files accepted or other issue.");
      onFileAccepted(null); 
      setIsDropzoneBrieflyProcessing(false);
      setCurrentFileMetaForDisplay(null);
    }
  }, [onFileAccepted, currentFileMetaForDisplay]); // Added currentFileMetaForDisplay to dependencies
  
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
    };
  }, []);
  
  if (isProcessingGlobal) { 
    return null; 
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg cursor-pointer transition-colors",
        isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/70",
        (isDropzoneBrieflyProcessing) ? "cursor-default opacity-70 bg-muted/50" : ""
      )}
    >
      <input {...getInputProps()} />
      {(isDropzoneBrieflyProcessing) ? (
        <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
      ) : (
        <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
      )}
      
      {isDragActive ? (
        <p className="text-lg font-semibold text-primary">Drop the file here ...</p>
      ) : (isDropzoneBrieflyProcessing) ? (
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
