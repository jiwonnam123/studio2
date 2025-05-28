
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ExcelUploadTabProps {
  uploadedFileState: UploadedFile | null;
  onFileChange: (file: UploadedFile | null) => void; // Callback to InquiryModal to update its state
  excelValidationState: ExcelValidationResult | null;
  isProcessingGlobal: boolean; // Global processing state from InquiryModal
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
  onFileChange, // This is InquiryModal's handleFileChange
  excelValidationState,
  isProcessingGlobal,
}: ExcelUploadTabProps) {
  
  const renderTime = new Date().toISOString();
  console.log(`[DEBUG ExcelUploadTab Rendering ${renderTime}] Props:`, { 
    isProcessingGlobal, 
    uploadedFileStateStatus: uploadedFileState?.status, 
    excelError: excelValidationState?.error, 
    excelHasData: excelValidationState?.hasData,
    excelIsValid: excelValidationState?.isValid,
    excelPreviewDataLength: excelValidationState?.previewData?.length 
  });

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/inquiry_template.xlsx';
    link.setAttribute('download', 'inquiry_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRemoveFile = () => {
    if (!isProcessingGlobal) {
      console.log("[DEBUG ExcelUploadTab handleRemoveFile] Calling onFileChange(null)");
      onFileChange(null); // This will call InquiryModal's handleFileChange
    }
  };

  const renderFileInfo = () => {
    if (!uploadedFileState || uploadedFileState.status === 'idle') {
        return null;
    }
    // Display file info if a file is present (regardless of its status: 'error' from dropzone, or 'success' and being processed/validated)
    // isProcessingGlobal will disable the remove button if needed.
    return (
      <div className="p-4 border rounded-lg bg-muted/30 mb-4">
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
            {/* Icon based on excelValidationState if file was successfully passed from dropzone */}
            {uploadedFileState.status === 'success' && !isProcessingGlobal && excelValidationState && (
              excelValidationState.isValid && excelValidationState.hasData ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" title="File is valid and has data" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-destructive" title={excelValidationState.error || "File validation issue"} />
              )
            )}
            {/* Icon for dropzone's own error state */}
            {uploadedFileState.status === 'error' && (
              <AlertTriangle className="w-5 h-5 text-destructive" title={uploadedFileState.errorMessage || "File upload error"} />
            )}
            
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isProcessingGlobal}>
              <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
        {/* Display FileUploadZone's own error message */}
        {uploadedFileState.status === 'error' && uploadedFileState.errorMessage && (
          <p className="text-xs text-destructive mt-1 pt-2 border-t border-destructive/20">{uploadedFileState.errorMessage}</p>
        )}
      </div>
    );
  };

  const renderValidationAndPreview = () => {
    // Only show validation/preview if NOT globally processing AND file was successfully passed from dropzone
    if (isProcessingGlobal || !uploadedFileState || uploadedFileState.status !== 'success' || !excelValidationState) {
      return null;
    }

    // Worker processing is complete (isProcessingGlobal is false). Display based on excelValidationState.
    if (excelValidationState.error) { // Error from worker (e.g. invalid headers, parse error)
      return (
        <Card className="border-destructive bg-destructive/10 mt-0"> {/* mt-4 removed */}
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center text-destructive text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Validation Error
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-destructive text-sm">{excelValidationState.error}</p>
            {/* Show preview even on error if previewData exists (e.g. to show malformed headers) */}
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
      return (
        <Card className="border-orange-500 bg-orange-500/10 mt-0">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center text-orange-600 text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              No Data Rows Found
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-orange-700 text-sm">
              The Excel file headers are valid, but no data rows were found beneath them.
              (Total data rows found by worker: {excelValidationState.totalDataRows ?? 0}).
            </p>
             {/* Show headers in preview even if no data rows */}
            {excelValidationState.previewData && excelValidationState.previewData.length > 0 && (
                renderPreviewTable(excelValidationState.previewData, excelValidationState.totalDataRows)
            )}
          </CardContent>
        </Card>
      );
    }

    // Valid and has data -> Show preview table
    if (excelValidationState.isValid && excelValidationState.hasData && excelValidationState.previewData) {
        return renderPreviewTable(excelValidationState.previewData, excelValidationState.totalDataRows);
    }
    
    // Fallback for unexpected excelValidationState (e.g. not error, but not valid/hasData)
    if (uploadedFileState?.status === 'success' && excelValidationState) { // Already checked !isProcessingGlobal
        return (
            <Card className="mt-0">
                <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                        File processed. Waiting for validation results or an unexpected state occurred.
                    </p>
                     <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto max-h-40">
                        {JSON.stringify(excelValidationState, null, 2)}
                    </pre>
                </CardContent>
            </Card>
        );
    }
    return null; // Should not be reached if logic is correct
  };
  
  const renderPreviewTable = (dataForPreviewTable: string[][], totalDataRowsInFile?: number) => {
    // dataForPreviewTable from worker includes headers as first row
    if (!dataForPreviewTable || dataForPreviewTable.length === 0) return null;
    
    const headers = dataForPreviewTable[0] || []; 
    const displayRows = dataForPreviewTable.slice(1); 

    return (
        <div className="space-y-2 mt-0"> {/* mt-4 removed */}
            <h3 className="text-base font-semibold">Data Preview:</h3>
            <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-600px)] md:h-[calc(100vh-500px)] min-h-[200px]">
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
                        {/* Pad with empty cells if row has fewer than header columns */}
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
            {totalDataRowsInFile !== undefined && ( // This is total data rows EXCLUDING header from worker
            <p className="text-xs text-muted-foreground mt-1">
                Displaying {displayRows.length} row(s) in preview from a total of {totalDataRowsInFile} data row(s) found in the file (after header).
                All valid data rows will be processed upon submission.
            </p>
            )}
        </div>
    );
  };

  // If globally processing, InquiryModal shows the loader in its header.
  // This tab should show either the dropzone or the file info + validation/preview.
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
      
      {/* Show FileUploadZone only if no file is active OR if a file is present but global processing is happening */}
      {/* Modified logic: Show FileUploadZone if no file, or if processing (to show loader inside dropzone) */}
      {(!uploadedFileState || uploadedFileState.status === 'idle') && !isProcessingGlobal && (
        <FileUploadZone onFileAccepted={onFileChange} disabled={isProcessingGlobal} />
      )}
      
      {/* Display file info if a file is selected and not globally processing (or if it's an error from dropzone) */}
      {uploadedFileState && uploadedFileState.status !== 'idle' && renderFileInfo()}

      {/* Display validation results and preview table */}
      {/* This section is only rendered if not globally processing, and a file has been successfully through dropzone */}
      {!isProcessingGlobal && uploadedFileState?.status === 'success' && renderValidationAndPreview()}
    </div>
  );
}
