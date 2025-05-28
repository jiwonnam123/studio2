
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  if (bytes === 0) return '0 Bytes';
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
    let activeWorker: Worker | null = null; 

    if (uploadedFileState?.file && uploadedFileState.status === 'success') {
      setIsParsing(true);
      setPreviewData(null); 
      setTotalDataRowsAfterParse(0);

      if (workerRef.current) {
        workerRef.current.terminate();
      }

      activeWorker = new Worker(new URL('@/workers/excelParser.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = activeWorker;

      activeWorker.postMessage({ file: uploadedFileState.file });

      activeWorker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
        if (workerRef.current !== activeWorker) return; 

        const { error, previewData: pData, totalDataRows: tRows, headersValid, dataExistsInSheet } = event.data;
        setPreviewData(pData);
        setTotalDataRowsAfterParse(tRows || 0);
        onValidationComplete({
          error,
          hasData: headersValid && dataExistsInSheet,
          totalDataRows: tRows || 0,
        });
        setIsParsing(false);
        if (workerRef.current === activeWorker) {
            activeWorker.terminate();
            workerRef.current = null;
        }
      };

      activeWorker.onerror = (err) => {
        if (workerRef.current !== activeWorker) return; 

        console.error("Excel parsing worker error:", err);
        const errorMessage = `File parsing error: ${err.message || 'An unexpected error occurred.'}`;
        setPreviewData(null);
        setTotalDataRowsAfterParse(0);
        onValidationComplete({
          error: errorMessage,
          hasData: false,
          totalDataRows: 0,
        });
        setIsParsing(false);
        if (workerRef.current === activeWorker) {
            activeWorker.terminate();
            workerRef.current = null;
        }
      };
    } else {
      // No active file to process, or initial error from FileUploadZone, or file removed.
      // Reset local states. Parent (InquiryModal) handles resetting excelValidationState via handleFileChange.
      setIsParsing(false);
      if (!uploadedFileState || uploadedFileState.status !== 'success') {
        setPreviewData(null);
        setTotalDataRowsAfterParse(0);
      }

      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    }

    return () => {
      if (activeWorker && workerRef.current === activeWorker) {
        activeWorker.terminate();
        workerRef.current = null;
      }
    };
  }, [uploadedFileState, onValidationComplete]); // onValidationComplete is stable due to useCallback in parent


  const handleRemoveFile = () => {
    onFileChange(null); // This will trigger InquiryModal's handleFileChange, which resets excelValidationState
                         // and also triggers the useEffect above to clean up local states and worker.
  };
  
  const fileUploadZoneError = uploadedFileState?.status === 'error' ? uploadedFileState.errorMessage : null;
  const parsingValidationError = excelValidationState?.error;
  // Display parsing error if it exists, otherwise display file upload zone error
  const finalErrorToDisplay = parsingValidationError ?? fileUploadZoneError;

  const isFileValidAndHasDataForSubmission = uploadedFileState?.status === 'success' && !parsingValidationError && excelValidationState?.hasData;
  const hasPreviewableData = previewData && previewData.length > 0 && !isParsing;


  if (isParsing) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] space-y-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Parsing and validating Excel file...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2">
      {(!uploadedFileState || fileUploadZoneError) && !isParsing ? (
        <>
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
        </>
      ) : uploadedFileState && !isParsing ? ( 
        <div className="space-y-4">
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
                  {isFileValidAndHasDataForSubmission && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {parsingValidationError && <AlertTriangle className="w-5 h-5 text-destructive" />}
                  {uploadedFileState.status === 'success' && !parsingValidationError && excelValidationState && !excelValidationState.hasData && <AlertTriangle className="w-5 h-5 text-orange-500" />}
                  <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
                    <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            </div>

            {parsingValidationError && (
                <Card className="border-destructive bg-destructive/10">
                <CardHeader>
                    <CardTitle className="flex items-center text-destructive text-lg">
                    <AlertTriangle className="mr-2 h-5 w-5" />
                    Validation Error
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">{parsingValidationError}</p>
                </CardContent>
                </Card>
            )}

            {isFileValidAndHasDataForSubmission && (
                <Card className="border-green-500 bg-green-500/10">
                <CardHeader>
                    <CardTitle className="flex items-center text-green-600 text-lg">
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    File Valid & Ready
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-green-700">The uploaded Excel file is valid and contains {excelValidationState?.totalDataRows} data row(s). Preview below. All rows will be processed upon submission.</p>
                </CardContent>
                </Card>
            )}
            
            {uploadedFileState.status === 'success' && !parsingValidationError && excelValidationState && !excelValidationState.hasData && (
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

            {hasPreviewableData && (
                <div className="space-y-2 mt-4">
                <h3 className="text-lg font-semibold">Data Preview:</h3>
                <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-650px)] md:h-[300px] min-h-[200px]">
                    <div className="overflow-auto">
                    <Table className="min-w-full text-sm">
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                        <TableRow>
                            {previewData[0].map((header, index) => (
                            <TableHead key={`header-${index}`} className={cn(
                                "px-3 py-2 whitespace-nowrap font-semibold",
                                parsingValidationError && !excelValidationState?.hasData && header?.trim() !== (excelValidationState?.error?.includes("Expected:") ? excelValidationState.error.split("Expected: \"")[1]?.split("\"")[0]?.split(", ")[index] : "INVALID_HEADER_CHECK")  && "bg-destructive/30 text-destructive-foreground"
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
                            {Array.from({ length: Math.max(0, previewData[0].length - row.length) }).map((_, emptyCellIndex) => (
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
                        Displaying all {totalDataRowsAfterParse} data row(s) from the file.
                    </p>
                )}
                </div>
            )}
        </div>
      ) : null } 
      
      {!isParsing && !uploadedFileState && !hasPreviewableData && !fileUploadZoneError && (
         <div className="flex flex-col items-center justify-center p-4 text-muted-foreground border-2 border-dashed rounded-lg min-h-[100px]">
            <FileText className="w-8 h-8 mb-2"/>
            <p>Upload an Excel file to see a preview.</p>
        </div>
      )}
    </div>
  );
}
