
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react';
import { FileUploadZone } from './FileUploadZone';
import type { UploadedFile, ExcelValidationResult } from '@/types/inquiry';
import type { WorkerParseResponse } from '@/workers/excelParser.worker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ExcelUploadTabProps {
  uploadedFileState: UploadedFile | null;
  onFileChange: (file: UploadedFile | null) => void;
  onValidationComplete: (result: ExcelValidationResult) => void;
  excelValidationState: ExcelValidationResult | null;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export function ExcelUploadTab({ uploadedFileState, onFileChange, onValidationComplete, excelValidationState }: ExcelUploadTabProps) {
  const [previewData, setPreviewData] = useState<string[][] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [totalDataRowsAfterParse, setTotalDataRowsAfterParse] = useState<number>(0);
  const workerRef = useRef<Worker | null>(null);

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/inquiry_template.xlsx';
    link.setAttribute('download', 'inquiry_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const currentFileForEffect = uploadedFileState?.file;
    const currentStatusForEffect = uploadedFileState?.status;

    if (!currentFileForEffect || currentStatusForEffect !== 'success') {
        setIsParsing(false); 
        setPreviewData(null);
        setTotalDataRowsAfterParse(0);
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        // If file was removed or had an upload error from FileUploadZone, inform parent to clear validation.
        // This is also handled by InquiryModal's handleFileChange, but being explicit here is fine.
        if (!uploadedFileState || currentStatusForEffect === 'error') {
            onValidationComplete({ error: uploadedFileState?.errorMessage || null, hasData: false, totalDataRows: 0 });
        }
        return; // Exit early
    }

    // Proceed with new parsing operation for a 'success' status file
    setIsParsing(true);
    setPreviewData(null);
    setTotalDataRowsAfterParse(0);
    // Reset validation in parent immediately before starting new parse
    // This ensures old validation messages don't persist while new file is parsing
    onValidationComplete({ error: null, hasData: false, totalDataRows: 0 });

    const worker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), {
        type: 'module',
    });
    workerRef.current = worker; // Store the new worker

    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
        if (workerRef.current !== worker) { // Message from a stale worker
            worker.terminate();
            return;
        }
        
        const { error: workerError, previewData: pData, totalDataRows: tRows, headersValid, dataExistsInSheet } = event.data;
        setPreviewData(pData);
        setTotalDataRowsAfterParse(tRows || 0);
        onValidationComplete({
            error: workerError,
            hasData: headersValid && dataExistsInSheet,
            totalDataRows: tRows || 0,
        });
        setIsParsing(false);
        worker.terminate(); // Done with this worker
        workerRef.current = null;
    };

    worker.onerror = (err) => {
        if (workerRef.current !== worker) { // Error from a stale worker
            worker.terminate();
            return;
        }
        console.error("ExcelUploadTab: Worker error:", err);
        const errorMessage = `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`;
        setPreviewData(null);
        setTotalDataRowsAfterParse(0);
        onValidationComplete({ error: errorMessage, hasData: false, totalDataRows: 0 });
        setIsParsing(false);
        worker.terminate(); // Done with this worker
        workerRef.current = null;
    };

    try {
        worker.postMessage({ file: currentFileForEffect });
    } catch (e) {
        console.error("ExcelUploadTab: Error posting message to worker:", e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown error posting to worker.';
        onValidationComplete({ error: errorMessage, hasData: false, totalDataRows: 0 });
        setIsParsing(false);
        worker.terminate(); // Terminate if postMessage failed
        if (workerRef.current === worker) {
            workerRef.current = null;
        }
    }

    // Cleanup function for THIS invocation of useEffect
    return () => {
        // console.log("ExcelUploadTab: useEffect cleanup, terminating worker if it's the one from this run:", worker);
        worker.terminate(); // Terminate the worker instance created in this effect run
        if (workerRef.current === worker) { // If it was still the "current" one, clear the ref
            workerRef.current = null;
        }
    };
  }, [uploadedFileState?.file, uploadedFileState?.status, onValidationComplete]);


  const handleRemoveFile = () => {
    onFileChange(null); 
  };
  
  const validationErrorToDisplay = excelValidationState?.error;
  const isFileValidAndHasData = excelValidationState && !excelValidationState.error && excelValidationState.hasData;
  const isSuccessAndNoData = excelValidationState && !excelValidationState.error && !excelValidationState.hasData && (totalDataRowsAfterParse === 0);
  const hasPreviewableData = previewData && previewData.length > 0 && !validationErrorToDisplay;

  if (isParsing) {
    return (
      <div className="flex flex-col items-center justify-center space-y-2 text-sm text-muted-foreground p-6 min-h-[200px] h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span>Parsing and validating Excel file, please wait...</span>
      </div>
    );
  }

  if (!uploadedFileState || uploadedFileState.status === 'idle') {
    return (
      <div className="space-y-4 py-2">
        <div className="flex justify-end items-center mb-4">
          <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Download Excel Template
          </Button>
        </div>
        <FileUploadZone onFileAccepted={onFileChange} />
         <div className="flex flex-col items-center justify-center p-4 text-muted-foreground border-2 border-dashed rounded-lg min-h-[100px] mt-4">
            <FileText className="w-8 h-8 mb-2"/>
            <p>Upload an Excel file to see a preview.</p>
        </div>
      </div>
    );
  }
  
  // If a file is "active" (uploaded, error from upload, or successfully parsed)
  return (
    <div className="space-y-4 py-2">
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                {uploadedFileState.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(uploadedFileState.size)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {uploadedFileState.status === 'uploading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
            {isFileValidAndHasData && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {(validationErrorToDisplay || uploadedFileState.status === 'error') && <AlertTriangle className="w-5 h-5 text-destructive" />}
            {isSuccessAndNoData && <AlertTriangle className="w-5 h-5 text-orange-500" />}
            <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
              <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
         {uploadedFileState.status === 'error' && uploadedFileState.errorMessage && (
            <p className="text-xs text-destructive mt-1 pt-2 border-t border-destructive/20">{uploadedFileState.errorMessage}</p>
          )}
      </div>

      {validationErrorToDisplay && (
          <Card className="border-destructive bg-destructive/10">
          <CardHeader>
              <CardTitle className="flex items-center text-destructive text-base"> 
              <AlertTriangle className="mr-2 h-5 w-5" />
              Validation Error
              </CardTitle>
          </CardHeader>
          <CardContent>
              <p className="text-destructive text-sm">{validationErrorToDisplay}</p>
          </CardContent>
          </Card>
      )}
      
      {isSuccessAndNoData && !validationErrorToDisplay && (
          <Card className="border-orange-500 bg-orange-500/10">
              <CardHeader>
              <CardTitle className="flex items-center text-orange-600 text-base">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  No Data To Submit
              </CardTitle>
              </CardHeader>
              <CardContent>
              <p className="text-orange-700 text-sm">The Excel file headers are valid, but no data rows were found. Please ensure your file contains data after the header row.</p>
              </CardContent>
          </Card>
      )}

      {hasPreviewableData && previewData && previewData.length > 0 && (
          <div className="space-y-2 mt-4">
          <h3 className="text-base font-semibold">Data Preview:</h3>
          <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-650px)] md:h-[calc(100vh-520px)] min-h-[200px]">
              <div className="overflow-auto">
              <Table className="min-w-full text-sm">
                  <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                      {previewData[0]?.map((header, index) => ( 
                      <TableHead key={`header-${index}`} className="px-3 py-2 whitespace-nowrap font-semibold">
                          {String(header) || `Column ${index + 1}`}
                      </TableHead>
                      ))}
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                  {previewData.slice(1).map((row, rowIndex) => (
                      <TableRow key={`row-${rowIndex}`} className={rowIndex % 2 === 1 ? "bg-muted/20" : ""}>
                      {row.map((cell, cellIndex) => (
                          <TableCell key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[200px]">
                          {String(cell)}
                          </TableCell>
                      ))}
                      {previewData[0] && Array.from({ length: Math.max(0, previewData[0].length - row.length) }).map((_, emptyCellIndex) => (
                          <TableCell key={`empty-${rowIndex}-${emptyCellIndex}`} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[200px]"></TableCell>
                      ))}
                      </TableRow>
                  ))}
                  </TableBody>
              </Table>
              </div>
              <ScrollBar orientation="horizontal" />
              <ScrollBar orientation="vertical" />
          </ScrollArea>
          {totalDataRowsAfterParse > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                  Displaying all {totalDataRowsAfterParse} data row(s) from the file. All rows will be processed upon submission.
              </p>
          )}
          </div>
      )}
       {/* Fallback if no preview, no error, but file exists (e.g. uploading status or unexpected state) */}
      {!isParsing && uploadedFileState && uploadedFileState.status === 'uploading' && (
        <div className="flex flex-col items-center justify-center p-4 text-muted-foreground border-2 border-dashed rounded-lg min-h-[100px] mt-4">
            <Loader2 className="w-8 h-8 mb-2 animate-spin text-primary"/>
            <p>Processing file...</p>
        </div>
      )}
    </div>
  );
}
