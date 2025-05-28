
"use client";

import React from 'react'; // Removed useEffect, useState, useCallback as they are managed by parent
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

interface ExcelUploadTabProps {
  uploadedFileState: UploadedFile | null;
  onFileChange: (file: UploadedFile | null) => void; // To remove the file
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
  console.log("[DEBUG ExcelUploadTab] Rendering. Props:", { isProcessingGlobal, uploadedFileStateStatus: uploadedFileState?.status, excelValidationStateError: excelValidationState?.error });

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
      onFileChange(null); // Notify parent (InquiryModal) to remove the file and reset states
    }
  };

  const renderFileInfoSection = () => {
    if (!uploadedFileState || uploadedFileState.status === 'idle') {
      return null;
    }
    // This shows if a file is selected, regardless of global processing state
    // Remove button is disabled if globally processing.
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
             {/* Icon logic based on excelValidationState if file processing is complete */}
            {!isProcessingGlobal && excelValidationState && excelValidationState.isValid && excelValidationState.hasData && (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            )}
            {!isProcessingGlobal && excelValidationState && excelValidationState.error && (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            )}
            {/* Show loader if dropzone is internally processing, or parent is globally processing THIS file */}
            {uploadedFileState.status === 'uploading' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}

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

  const renderValidationAndPreviewSection = () => {
    // This section is only rendered if global processing is NOT active AND file was "successfully" passed from dropzone,
    // AND excelValidationState is available (meaning worker processing is done).
    if (isProcessingGlobal || !uploadedFileState || uploadedFileState.status !== 'success' || !excelValidationState) {
      return null;
    }

    // At this point, worker processing is complete. Display based on excelValidationState.
    if (excelValidationState.error) {
      return (
        <Card className="border-destructive bg-destructive/10 mt-4">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Validation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm">{excelValidationState.error}</p>
            {excelValidationState.previewData && excelValidationState.previewData.length > 0 && (
              <p className="text-xs text-destructive mt-1">
                Preview might show partial data. Please check the template and error message.
              </p>
            )}
          </CardContent>
        </Card>
      );
    }

    if (!excelValidationState.hasData) { 
      return (
        <Card className="border-orange-500 bg-orange-500/10 mt-4">
          <CardHeader>
            <CardTitle className="flex items-center text-orange-600 text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              No Data To Submit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-orange-700 text-sm">
              The Excel file headers are {excelValidationState.headersValid ? "valid" : "invalid"}, but no actual data rows were found (Total data rows: {excelValidationState.totalDataRows ?? 0}).
              Please ensure your file contains data after the header row.
            </p>
          </CardContent>
        </Card>
      );
    }

    // Headers valid, has data, no error -> Show preview
    if (excelValidationState.isValid && excelValidationState.hasData && excelValidationState.previewData && excelValidationState.previewData.length > 0) {
      const headers = excelValidationState.previewData[0] || [];
      const dataRows = excelValidationState.previewData.slice(1);

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
                  {dataRows.map((row, rowIndex) => (
                    <TableRow key={`row-${rowIndex}`} className={rowIndex % 2 === 1 ? "bg-muted/20" : ""}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[180px]">
                          {String(cell)}
                        </TableCell>
                      ))}
                      {/* Fill empty cells if row has fewer cells than headers */}
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
           {excelValidationState.totalDataRows !== undefined && (
             <p className="text-xs text-muted-foreground mt-1">
               Displaying {Math.min(dataRows.length, PREVIEW_ROWS_LIMIT)} row(s) for preview from a total of {excelValidationState.totalDataRows} data row(s) found.
               All valid rows will be processed upon submission.
             </p>
           )}
        </div>
      );
    }
    
    // Fallback for unexpected excelValidationState if not error, no data, or valid preview
    if (!isProcessingGlobal && uploadedFileState?.status === 'success' && excelValidationState) {
        return (
            <Card className="mt-4">
                <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                        File processed. Current validation state is unexpected. Please check the file or try again.
                    </p>
                    <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                        {JSON.stringify(excelValidationState, null, 2)}
                    </pre>
                </CardContent>
            </Card>
        );
    }
    return null; // Default return if no other condition is met
  };

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

      {/* Show FileUploadZone only if no file is active OR parent is not globally processing */}
      {/* Modify this: FileUploadZone should be shown if !uploadedFileState OR if user removed file. */}
      {/* If uploadedFileState exists, show file info. Parsing UI is handled by InquiryModal header. */}

      {(!uploadedFileState || uploadedFileState.status === 'idle') && !isProcessingGlobal && (
        <FileUploadZone onFileAccepted={onFileChange} isProcessingGlobal={isProcessingGlobal} />
      )}
      
      {uploadedFileState && uploadedFileState.status !== 'idle' && renderFileInfoSection() }

      {/* Validation/Preview section is rendered based on its own internal logic using props */}
      {renderValidationAndPreviewSection()}
    </div>
  );
}
