
"use client";

import React from 'react'; // Removed unused useEffect, useRef
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react';
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

interface ExcelUploadTabProps {
  uploadedFileState: UploadedFile | null;
  onFileChange: (file: UploadedFile | null) => void;
  excelValidationState: ExcelValidationResult | null;
  isProcessing: boolean; // Global processing state from InquiryModal
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
  isProcessing,
}: ExcelUploadTabProps) {
  // This console log is crucial for debugging what props are being received when the UI seems stuck.
  console.log("ExcelUploadTab Rendering. Props:", { isProcessing, uploadedFileState, excelValidationState });

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/inquiry_template.xlsx';
    link.setAttribute('download', 'inquiry_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRemoveFile = () => {
    if (!isProcessing) {
      onFileChange(null);
    }
  };

  // File Info and Remove Button Section (Displayed if a file is present and not in initial 'idle' state)
  const renderFileInfoSection = () => {
    if (!uploadedFileState || uploadedFileState.status === 'idle') {
      return null;
    }
    // This section shows up once a file is selected/dropped, regardless of validation, unless isProcessing is true.
    // If isProcessing is true, InquiryModal header shows global loader, so this tab can be minimal.
    // We show file info even if parent isProcessing, as file has been selected.
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
            {/* Icon based on validation result, if available and successful */}
            {uploadedFileState.status === 'success' && excelValidationState && !excelValidationState.error && excelValidationState.hasData && (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            )}
            {/* Icon for dropzone error or validation error */}
            {(uploadedFileState.status === 'error' || (excelValidationState && excelValidationState.error)) && (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            )}
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isProcessing}>
              <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
        {uploadedFileState.status === 'error' && uploadedFileState.errorMessage && (
          <p className="text-xs text-destructive mt-1 pt-2 border-t border-destructive/20">{uploadedFileState.errorMessage}</p>
        )}
      </div>
    );
  };

  // Validation Messages and Data Preview Section
  const renderValidationAndPreviewSection = () => {
    if (isProcessing) {
      // If globally processing, the parent modal header shows a loader.
      // This section can be empty or show a minimal message.
      return (
        <div className="flex flex-col items-center justify-center p-6 min-h-[200px] text-muted-foreground">
          {/* "Processing file..." text is now in Modal Header */}
        </div>
      );
    }
    
    // Only proceed if the file was successfully handled by FileUploadZone
    if (uploadedFileState?.status !== 'success') {
      // If status is 'error' (from FileUploadZone), it's handled by renderFileInfoSection.
      // If 'idle' or 'uploading', FileUploadZone handles its own UI.
      return null;
    }

    // At this point, uploadedFileState.status === 'success'. Now check excelValidationState.
    if (!excelValidationState) {
      // Worker might still be processing, or an issue occurred before validationState was set.
      // InquiryModal's isProcessing should cover the "worker processing" case.
      // If isProcessing is false here, but no excelValidationState, it's an intermediary or unexpected state.
      return (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              File uploaded. Waiting for validation results...
            </p>
          </CardContent>
        </Card>
      );
    }

    if (excelValidationState.error) {
      return (
        <Card className="border-destructive bg-destructive/10">
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
                Showing first {Math.min(excelValidationState.previewData.length - 1, 20)} rows for context.
              </p>
            )}
          </CardContent>
        </Card>
      );
    }

    if (!excelValidationState.hasData) {
      return (
        <Card className="border-orange-500 bg-orange-500/10">
          <CardHeader>
            <CardTitle className="flex items-center text-orange-600 text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              No Data To Submit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-orange-700 text-sm">
              The Excel file headers are valid, but no data rows were found (Total data rows: {excelValidationState.totalDataRows ?? 0}).
              Please ensure your file contains data after the header row.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (excelValidationState.headersValid && excelValidationState.hasData && excelValidationState.previewData && excelValidationState.previewData.length > 0) {
      return (
        <div className="space-y-2 mt-4">
          <h3 className="text-base font-semibold">Data Preview:</h3>
          <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-650px)] md:h-[calc(100vh-550px)] min-h-[200px]">
            <div className="overflow-auto">
              <Table className="min-w-full text-sm">
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    {excelValidationState.previewData[0]?.map((header, index) => (
                      <TableHead key={`header-${index}`} className="px-3 py-2 whitespace-nowrap font-semibold">
                        {String(header) || `Column ${index + 1}`}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excelValidationState.previewData.slice(1).map((row, rowIndex) => (
                    <TableRow key={`row-${rowIndex}`} className={rowIndex % 2 === 1 ? "bg-muted/20" : ""}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[180px]">
                          {String(cell)}
                        </TableCell>
                      ))}
                      {excelValidationState.previewData[0] && Array.from({ length: Math.max(0, (excelValidationState.previewData[0]?.length || 0) - row.length) }).map((_, emptyCellIndex) => (
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
              Displaying {excelValidationState.previewData.length - 1} row(s) for preview from a total of {excelValidationState.totalDataRows} data row(s) found.
              All valid rows will be processed upon submission.
            </p>
          )}
        </div>
      );
    }
    
    // Fallback for any other unhandled (but theoretically valid) excelValidationState
    return (
        <Card>
            <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                    File processed, but the current state is unexpected. Please check the console.
                </p>
            </CardContent>
        </Card>
    );
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex justify-end items-center mb-4">
        <Button
          variant="outline"
          onClick={handleDownloadTemplate}
          className="w-full sm:w-auto"
          disabled={isProcessing}
        >
          <Download className="mr-2 h-4 w-4" />
          Download Excel Template
        </Button>
      </div>

      {isProcessing && (
        <div className="flex flex-col items-center justify-center p-6 min-h-[300px] h-full">
          {/* Global processing indicator is in InquiryModal header. This space can be minimal. */}
        </div>
      )}

      {!isProcessing && (!uploadedFileState || uploadedFileState.status === 'idle') && (
        <FileUploadZone onFileAccepted={onFileChange} />
      )}
      
      {!isProcessing && uploadedFileState && uploadedFileState.status !== 'idle' && (
        <>
          {renderFileInfoSection()}
          {renderValidationAndPreviewSection()}
        </>
      )}
    </div>
  );
}
