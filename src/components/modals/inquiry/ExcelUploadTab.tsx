
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
    // Store the current worker instance from the ref for use in this effect's closure
    const effectInstanceWorker = workerRef.current;

    if (uploadedFileState?.file && uploadedFileState.status === 'success') {
      setIsParsing(true);
      setPreviewData(null);
      setTotalDataRowsAfterParse(0);

      // Terminate any existing worker from previous renders/effects
      if (effectInstanceWorker) {
        effectInstanceWorker.terminate();
        workerRef.current = null; // Clear the ref immediately
      }
      
      let newWorkerInstance: Worker | null = null;
      try {
        newWorkerInstance = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = newWorkerInstance; // Assign the new worker to the ref

        newWorkerInstance.postMessage({ file: uploadedFileState.file });

        newWorkerInstance.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
          // Ensure this message is from the current active worker
          if (workerRef.current !== newWorkerInstance) {
            console.warn("Received message from a stale or unexpected worker.");
            newWorkerInstance?.terminate(); // Terminate this worker if it's not the current one
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
          // Terminate and clear ref after processing
          newWorkerInstance?.terminate();
          if (workerRef.current === newWorkerInstance) {
            workerRef.current = null;
          }
        };

        newWorkerInstance.onerror = (err) => {
           if (workerRef.current !== newWorkerInstance) {
            console.warn("Received error from a stale or unexpected worker during onerror.");
            newWorkerInstance?.terminate();
            return;
          }
          console.error("Excel parsing worker error:", err);
          const errorMessage = `File parsing worker error: ${err.message || 'An unexpected error occurred.'}`;
          setPreviewData(null);
          setTotalDataRowsAfterParse(0);
          onValidationComplete({
            error: errorMessage,
            hasData: false,
            totalDataRows: 0,
          });
          setIsParsing(false);
          newWorkerInstance?.terminate();
          if (workerRef.current === newWorkerInstance) {
            workerRef.current = null;
          }
        };
      } catch (e) {
        console.error("Error instantiating or posting to worker:", e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown error with worker setup.';
        setIsParsing(false);
        setPreviewData(null);
        setTotalDataRowsAfterParse(0);
        onValidationComplete({ error: `Worker setup failed: ${errorMessage}`, hasData: false, totalDataRows: 0 });
        
        newWorkerInstance?.terminate(); // Terminate if created before error
        if (workerRef.current === newWorkerInstance) { // Clear ref if it was set
             workerRef.current = null;
        }
      }
    } else if (!uploadedFileState || uploadedFileState.status === 'idle' || uploadedFileState.status === 'error') {
      // Clear local states if no file, file is idle, or file had an upload error
      if (previewData !== null) setPreviewData(null);
      if (totalDataRowsAfterParse !== 0) setTotalDataRowsAfterParse(0);
      if (isParsing) setIsParsing(false); // Ensure parsing is stopped

      // If there's an active worker (e.g., from a previous successful upload that's now removed), terminate it.
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      // Notify parent about the (lack of) validation state if file is removed or had upload error.
      // Only call if state needs actual clearing or error reporting.
      if (uploadedFileState?.status === 'error' ) {
         onValidationComplete({ error: uploadedFileState.errorMessage || "File upload error", hasData: false, totalDataRows: 0});
      } else if (!uploadedFileState && excelValidationState !== null ) { 
        // If file is removed and there was a previous validation state.
         onValidationComplete({ error: null, hasData: false, totalDataRows: 0 });
      }
    }

    // Cleanup function for the useEffect hook
    return () => {
      // This cleanup runs when the component unmounts or before the effect runs again.
      // It should terminate the worker that was potentially started by *this specific invocation* of the effect.
      // However, workerRef.current holds the latest worker.
      // The logic inside the effect already handles terminating the "current" worker before starting a new one.
      // And onmessage/onerror handlers also terminate their specific worker instance.
      // A general cleanup for workerRef.current can be here if component unmounts mid-operation.
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [uploadedFileState, onValidationComplete, excelValidationState]); // excelValidationState added to re-evaluate if parent cleared it


  const handleRemoveFile = () => {
    onFileChange(null); 
  };
  
  const fileUploadZoneError = uploadedFileState?.status === 'error' ? uploadedFileState.errorMessage : null;
  // This is the validation error from the worker, or from worker setup.
  const parsingOrValidationSystemError = excelValidationState?.error; 
  
  // True if file processed successfully by worker, headers were valid, and data rows exist.
  const isFileValidAndHasData = excelValidationState && !excelValidationState.error && excelValidationState.hasData;
  // True if file processed by worker, headers valid, but no data rows.
  const isSuccessAndNoData = excelValidationState && !excelValidationState.error && !excelValidationState.hasData;

  const hasPreviewableData = previewData && previewData.length > 0 && !isParsing && !parsingOrValidationSystemError;


  if (isParsing) {
    return (
      <div className="flex flex-col items-center justify-center space-y-2 text-sm text-muted-foreground p-6 min-h-[200px] h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span>Parsing and validating Excel file, please wait...</span>
      </div>
    );
  }

  // If no file is uploaded yet, or if there was an error during FileUploadZone's processing
  if (!uploadedFileState || uploadedFileState.status === 'idle' || uploadedFileState.status === 'error') {
    return (
      <div className="space-y-4 py-2">
        <div className="flex justify-end items-center">
          <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Download Excel Template
          </Button>
        </div>
        <FileUploadZone onFileAccepted={onFileChange} />
        {fileUploadZoneError && ( 
           <Card className="border-destructive bg-destructive/10 mt-4">
              <CardHeader>
                  <CardTitle className="flex items-center text-destructive text-base">
                  <AlertTriangle className="mr-2 h-5 w-5" /> File Upload Error
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <p className="text-destructive text-sm">{fileUploadZoneError}</p>
                   {uploadedFileState && <p className="text-destructive text-xs mt-1">File: {uploadedFileState.name} ({formatBytes(uploadedFileState.size)})</p>}
              </CardContent>
          </Card>
        )}
        {(!uploadedFileState || uploadedFileState.status === 'idle') && !fileUploadZoneError && (
           <div className="flex flex-col items-center justify-center p-4 text-muted-foreground border-2 border-dashed rounded-lg min-h-[100px] mt-4">
              <FileText className="w-8 h-8 mb-2"/>
              <p>Upload an Excel file to see a preview.</p>
          </div>
        )}
      </div>
    );
  }
  
  // If a file has been "successfully" uploaded by FileUploadZone (status === 'success')
  // and isParsing is false (meaning worker has finished or failed to start properly)
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
            {isFileValidAndHasData && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {parsingOrValidationSystemError && <AlertTriangle className="w-5 h-5 text-destructive" />}
            {isSuccessAndNoData && <AlertTriangle className="w-5 h-5 text-orange-500" />}
            <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
              <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      {parsingOrValidationSystemError && (
          <Card className="border-destructive bg-destructive/10">
          <CardHeader>
              <CardTitle className="flex items-center text-destructive text-lg">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Validation Error
              </CardTitle>
          </CardHeader>
          <CardContent>
              <p className="text-destructive">{parsingOrValidationSystemError}</p>
          </CardContent>
          </Card>
      )}
      
      {isSuccessAndNoData && ( // Only show if no system error occurred
          <Card className="border-orange-500 bg-orange-500/10">
              <CardHeader>
              <CardTitle className="flex items-center text-orange-600 text-lg">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  No Data To Submit
              </CardTitle>
              </CardHeader>
              <CardContent>
              <p className="text-orange-700">The Excel file headers are valid, but no data rows were found. Please ensure your file contains data after the header row.</p>
              </CardContent>
          </Card>
      )}

      {hasPreviewableData && ( // This implies !parsingOrValidationSystemError
          <div className="space-y-2 mt-4">
          <h3 className="text-lg font-semibold">Data Preview:</h3>
          <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-650px)] md:h-[300px] min-h-[200px]">
              <div className="overflow-auto">
              <Table className="min-w-full text-sm">
                  <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                      {previewData[0]?.map((header, index) => ( 
                      <TableHead key={`header-${index}`} className={cn(
                          "px-3 py-2 whitespace-nowrap font-semibold",
                          // This specific styling for invalid headers during preview is tricky
                          // if parsingOrValidationSystemError is used, it might hide the preview itself.
                          // For now, just show headers as they are. Worker provides header validation.
                      )}>
                          {header || `Column ${index + 1}`}
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
    </div>
  );
}
