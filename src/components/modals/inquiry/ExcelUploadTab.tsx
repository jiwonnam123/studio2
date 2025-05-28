"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle, CheckCircle2, FileText, XCircle, Loader2 } from 'lucide-react';
import { FileUploadZone } from './FileUploadZone';
import type { UploadedFile, ExcelValidationResult } from '@/types/inquiry';
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
  excelValidationState: ExcelValidationResult | null;
  isProcessingGlobal: boolean; 
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export function ExcelUploadTab({
  uploadedFileState,
  onFileChange,
  excelValidationState,
  isProcessingGlobal,
}: ExcelUploadTabProps) {
  
  // console.log("[DEBUG ExcelUploadTab] Rendering. Props:", { isProcessingGlobal, uploadedFileStateStatus: uploadedFileState?.status, excelValidationStateError: excelValidationState?.error, excelHasData: excelValidationState?.hasData });

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/inquiry_template.xlsx';
    link.setAttribute('download', 'inquiry_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRemoveFile = () => {
    // Global processing check is good, but button should be disabled by parent anyway
    if (!isProcessingGlobal) { 
      onFileChange(null); 
    }
  };

  const renderFileInfo = () => {
    if (!uploadedFileState || uploadedFileState.status === 'idle' || isProcessingGlobal) {
        return null;
    }
    // Shows when a file is selected (status 'uploading' or 'success' or 'error' from dropzone) AND not globally processing
    return (
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
            {uploadedFileState.status === 'uploading' && !isProcessingGlobal && <Loader2 className="w-5 h-5 text-primary animate-spin" title="File dropzone processing..." />}
            
            {/* Icons after worker processing (if not globally processing) */}
            {uploadedFileState.status === 'success' && !isProcessingGlobal && excelValidationState && excelValidationState.isValid && (
              <CheckCircle2 className="w-5 h-5 text-green-500" title="File is valid" />
            )}
            {(uploadedFileState.status === 'error' || (uploadedFileState.status === 'success' && excelValidationState && !excelValidationState.isValid && excelValidationState.error)) && !isProcessingGlobal && (
              <AlertTriangle className="w-5 h-5 text-destructive" title={uploadedFileState.errorMessage || excelValidationState?.error || "Error"} />
            )}
            
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isProcessingGlobal}>
              <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
        {/* Display FileUploadZone's own error message if not globally processing */}
        {uploadedFileState.status === 'error' && uploadedFileState.errorMessage && !isProcessingGlobal && (
          <p className="text-xs text-destructive mt-1 pt-2 border-t border-destructive/20">{uploadedFileState.errorMessage}</p>
        )}
      </div>
    );
  };

  const renderValidationAndPreview = () => {
    if (isProcessingGlobal || !uploadedFileState || uploadedFileState.status !== 'success' || !excelValidationState) {
      return null;
    }

    // Worker processing is complete. Display based on excelValidationState.
    if (excelValidationState.error && !excelValidationState.isValid) { // Error that makes it invalid
      return (
        <Card className="border-destructive bg-destructive/10 mt-4">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center text-destructive text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Validation Error
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-destructive text-sm">{excelValidationState.error}</p>
            {excelValidationState.previewData && excelValidationState.previewData.length > 0 && (
                <>
                    <p className="text-xs text-destructive mt-1">
                        Preview might show partial or incorrect data.
                    </p>
                    {renderPreviewTable(excelValidationState.previewData, excelValidationState.totalDataRows)}
                </>
            )}
          </CardContent>
        </Card>
      );
    }

    if (!excelValidationState.hasData && excelValidationState.headersValid) { 
      // Headers are fine, but no data rows after header
      return (
        <Card className="border-orange-500 bg-orange-500/10 mt-4">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center text-orange-600 text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              No Data Rows Found
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-orange-700 text-sm">
              The Excel file headers are valid, but no data rows were found beneath them. (Total data rows found by worker: {excelValidationState.totalDataRows ?? 0}).
            </p>
            {excelValidationState.previewData && excelValidationState.previewData.length > 0 && (
                renderPreviewTable(excelValidationState.previewData, excelValidationState.totalDataRows)
            )}
          </CardContent>
        </Card>
      );
    }

    // Valid and has data -> Show preview
    if (excelValidationState.isValid && excelValidationState.hasData && excelValidationState.previewData) {
        // The success toast is shown by InquiryModal
        return renderPreviewTable(excelValidationState.previewData, excelValidationState.totalDataRows);
    }
    
    // Fallback for unexpected excelValidationState
    if (uploadedFileState?.status === 'success' && excelValidationState && !isProcessingGlobal) {
        return (
            <Card className="mt-4">
                <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                        File processed. Unexpected validation state. Please check console or retry.
                    </p>
                     <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto max-h-40">
                        {JSON.stringify(excelValidationState, null, 2)}
                    </pre>
                </CardContent>
            </Card>
        );
    }
    return null;
  };
  
  const renderPreviewTable = (dataForPreviewTable: string[][], totalDataRowsInFile?: number) => {
    if (!dataForPreviewTable || dataForPreviewTable.length === 0) return null;
    
    const headers = dataForPreviewTable[0] || []; 
    const displayRows = dataForPreviewTable.slice(1); 

    return (
        <div className="space-y-2 mt-4">
            <h3 className="text-base font-semibold">Data Preview:</h3>
            <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-650px)] md:h-[calc(100vh-550px)] min-h-[200px]">
            <div className="overflow-auto">
                <Table className="min-w-full text-sm">
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                    {headers.map((header, index) => (
                        <TableHead key={`header-${index}`} className="px-3 py-2 whitespace-nowrap font-semibold">
                        {String(header) || `Column ${index + 1}`}
                        </TableHead>
                    ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {displayRows.map((row, rowIndex) => (
                    <TableRow key={`row-${rowIndex}`} className={cn(rowIndex % 2 === 1 ? "bg-muted/20" : "")}>
                        {row.map((cell, cellIndex) => (
                        <TableCell key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[180px]">
                            {String(cell)}
                        </TableCell>
                        ))}
                        {Array.from({ length: Math.max(0, headers.length - row.length) }).map((_, emptyCellIndex) => (
                        <TableCell key={`empty-${rowIndex}-${emptyCellIndex}`} className="px-3 py-1.5"></TableCell>
                        ))}
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
            </ScrollArea>
            {totalDataRowsInFile !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
                Displaying {displayRows.length} row(s) in preview from a total of {totalDataRowsInFile} data row(s) found in the file (after header).
                All valid data rows will be processed upon submission.
            </p>
            )}
        </div>
    );
  };

  // If globally processing, parent modal shows the loader.
  if (isProcessingGlobal) {
    return null; 
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex justify-end items-center mb-4">
        <Button
          variant="outline"
          onClick={handleDownloadTemplate}
          className="w-full sm:w-auto"
          disabled={isProcessingGlobal} 
        >
          <Download className="mr-2 h-4 w-4" />
          Download Excel Template
        </Button>
      </div>
      
      {/* Show FileUploadZone only if no file is active */}
      {(!uploadedFileState || uploadedFileState.status === 'idle') && (
        <FileUploadZone onFileAccepted={onFileChange} isProcessingGlobal={isProcessingGlobal} />
      )}
      
      {/* Display file info if a file is present (regardless of processing, parent handles loader) */}
      {uploadedFileState && uploadedFileState.status !== 'idle' && renderFileInfo()}

      {renderValidationAndPreview()}
    </div>
  );
}