
"use client";

import type React from 'react';
import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { UploadedFile } from '@/types/inquiry';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFileAccepted: (file: UploadedFile | null) => void;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export function FileUploadZone({ onFileAccepted }: FileUploadZoneProps) {
  const [internalUploadedFile, setInternalUploadedFile] = useState<UploadedFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // General processing state for dropzone

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setIsProcessing(true);
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      const firstError = rejection.errors[0];
      let errorMessage = "Invalid file.";
      if (firstError.code === 'file-too-large') {
          errorMessage = `File is too large. Max size is ${formatBytes(5 * 1024 * 1024)}.`;
      } else if (firstError.code === 'file-invalid-type') {
          errorMessage = "Invalid file type. Please upload .xlsx, .xls, or .csv files.";
      }
      setInternalUploadedFile({
        file: rejection.file,
        name: rejection.file.name,
        size: rejection.file.size,
        type: rejection.file.type,
        status: 'error',
        errorMessage: errorMessage,
      });
      setIsProcessing(false);
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setInternalUploadedFile({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading', // Start with uploading status
      });

      // Simulate upload process
      setTimeout(() => {
        setInternalUploadedFile(prev => prev ? {...prev, status: 'success'} : null);
        setIsProcessing(false);
      }, 1500); // Simulating network delay
    } else {
      setIsProcessing(false); // No files accepted
    }
  }, []);

  useEffect(() => {
    // Propagate changes of internalUploadedFile to the parent
    onFileAccepted(internalUploadedFile);
  }, [internalUploadedFile, onFileAccepted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxSize: 5 * 1024 * 1024, // 5MB limit
    disabled: isProcessing, // Disable dropzone while processing or "uploading"
  });

  const removeFile = () => {
    setInternalUploadedFile(null);
    // onFileAccepted(null) will be called by the useEffect above
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/70",
          internalUploadedFile?.status === 'error' ? "border-destructive bg-destructive/10" : "",
          isProcessing ? "cursor-default opacity-70" : ""
        )}
      >
        <input {...getInputProps()} />
        {isProcessing && internalUploadedFile?.status === 'uploading' ? (
            <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
        ) : (
            <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
        )}
        
        {isDragActive ? (
          <p className="text-lg font-semibold text-primary">Drop the file here ...</p>
        ) : isProcessing && internalUploadedFile?.status === 'uploading' ? (
          <p className="text-sm text-primary">Processing file...</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              <span className="font-semibold text-primary">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">XLSX, XLS, or CSV (MAX. 5MB)</p>
          </>
        )}
      </div>

      {internalUploadedFile && (
        <div className="p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                  {internalUploadedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(internalUploadedFile.size)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
                {internalUploadedFile.status === 'uploading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                {internalUploadedFile.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                {internalUploadedFile.status === 'error' && <XCircle className="w-5 h-5 text-destructive" />}
                 <Button variant="ghost" size="icon" onClick={removeFile} disabled={isProcessing && internalUploadedFile.status === 'uploading'}>
                    <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
                 </Button>
            </div>
          </div>
          {internalUploadedFile.status === 'uploading' && (
            <Progress value={50} className="h-1 mt-2" /> 
          )}
          {internalUploadedFile.status === 'error' && internalUploadedFile.errorMessage && (
            <p className="text-xs text-destructive mt-1">{internalUploadedFile.errorMessage}</p>
          )}
           {internalUploadedFile.status === 'success' && (
             <p className="text-xs text-green-600 mt-1">File ready for validation and preview.</p>
           )}
        </div>
      )}
    </div>
  );
}
