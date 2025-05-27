
"use client";

import type React from 'react';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { UploadedFile } from '@/types/inquiry';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFileAccepted: (file: UploadedFile) => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onUploadError?: (error: string) => void; // Placeholder for future error handling
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
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false); // Simulate upload progress

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      const rejectionReason = fileRejections[0].errors[0].message;
      setUploadedFile({
        file: fileRejections[0].file,
        name: fileRejections[0].file.name,
        size: fileRejections[0].file.size,
        type: fileRejections[0].file.type,
        status: 'error',
        errorMessage: rejectionReason,
      });
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const newFile: UploadedFile = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'idle',
      };
      setUploadedFile(newFile);
      onFileAccepted(newFile); // Notify parent, actual upload logic would be here or in parent

      // Simulate upload
      setIsUploading(true);
      setUploadedFile(prev => prev ? {...prev, status: 'uploading'} : null);
      setTimeout(() => {
        setIsUploading(false);
        // Simulate success, in real app this depends on server response
        setUploadedFile(prev => prev ? {...prev, status: 'success'} : null); 
      }, 2000); 
    }
  }, [onFileAccepted]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxSize: 5 * 1024 * 1024, // 5MB limit
    onDropRejected: (fileRejections) => {
       if (fileRejections.length > 0) {
        const firstError = fileRejections[0].errors[0];
        let errorMessage = "Invalid file.";
        if (firstError.code === 'file-too-large') {
            errorMessage = `File is too large. Max size is ${formatBytes(5 * 1024 * 1024)}.`;
        } else if (firstError.code === 'file-invalid-type') {
            errorMessage = "Invalid file type. Please upload .xlsx, .xls, or .csv files.";
        }
        setUploadedFile({
          file: fileRejections[0].file,
          name: fileRejections[0].file.name,
          size: fileRejections[0].file.size,
          type: fileRejections[0].file.type,
          status: 'error',
          errorMessage: errorMessage,
        });
      }
    }
  });

  const removeFile = () => {
    setUploadedFile(null);
    // Potentially call a prop to notify parent of removal
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/70",
          uploadedFile?.status === 'error' ? "border-destructive bg-destructive/10" : ""
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className={cn("w-10 h-10 mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
        {isDragActive ? (
          <p className="text-lg font-semibold text-primary">Drop the file here ...</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              <span className="font-semibold text-primary">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">XLSX, XLS, or CSV (MAX. 5MB)</p>
          </>
        )}
      </div>
      <Button type="button" variant="outline" onClick={open} className="w-full sm:w-auto">
        Select File
      </Button>

      {uploadedFile && (
        <div className="p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                  {uploadedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(uploadedFile.size)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
                {uploadedFile.status === 'uploading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                {uploadedFile.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                {uploadedFile.status === 'error' && <XCircle className="w-5 h-5 text-destructive" />}
                 <Button variant="ghost" size="icon" onClick={removeFile}>
                    <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
                 </Button>
            </div>
          </div>
          {uploadedFile.status === 'uploading' && (
            <Progress value={50} className="h-1 mt-2" /> // Simulate progress
          )}
          {uploadedFile.status === 'error' && uploadedFile.errorMessage && (
            <p className="text-xs text-destructive mt-1">{uploadedFile.errorMessage}</p>
          )}
           {uploadedFile.status === 'success' && (
             <p className="text-xs text-green-600 mt-1">File ready for submission.</p>
           )}
        </div>
      )}
    </div>
  );
}
