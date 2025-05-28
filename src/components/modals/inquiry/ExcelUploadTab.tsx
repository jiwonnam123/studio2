
"use client";

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react'; // Loader2 removed, parent handles global loader
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

  // Section for displaying file info and remove button
  const renderFileInfoSection = () => {
    if (!uploadedFileState || uploadedFileState.status === 'idle') {
      return null;
    }
    // This section shows up once a file is selected/dropped, regardless of global processing state.
    // However, the remove button is disabled if globally processing.
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
            {/* Success icon only if NOT processing and validation is successful */}
            {!isProcessing && uploadedFileState.status === 'success' && excelValidationState && !excelValidationState.error && excelValidationState.hasData && excelValidationState.headersValid && (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            )}
            {/* Error icon only if NOT processing and there's an error */}
            {!isProcessing && (uploadedFileState.status === 'error' || (excelValidationState && excelValidationState.error)) && (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            )}
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isProcessing}>
              <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
        {/* Display FileUploadZone's own error message if not globally processing */}
        {uploadedFileState.status === 'error' && uploadedFileState.errorMessage && !isProcessing && (
          <p className="text-xs text-destructive mt-1 pt-2 border-t border-destructive/20">{uploadedFileState.errorMessage}</p>
        )}
      </div>
    );
  };

  // Section for displaying validation messages (error, no data) or data preview
  const renderValidationAndPreviewSection = () => {
    // If globally processing, this tab relies on the modal header's loader.
    // Or if file upload from FileUploadZone wasn't 'success'.
    if (isProcessing || !uploadedFileState || uploadedFileState.status !== 'success') {
      return null;
    }

    // At this point, file was "successfully" passed from FileUploadZone, and we are not globally processing.
    // Now, display based on excelValidationState (result from worker).
    if (!excelValidationState) {
      // This case should ideally be covered by isProcessing=true if worker is running.
      // If reached and not processing, it implies worker hasn't started or finished yet, or state sync issue.
      return (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              File uploaded. Awaiting validation results...
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
                Showing first {Math.min(excelValidationState.previewData.length -1 , 20)} row(s) for context. Consider checking the template.
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
              The Excel file {excelValidationState.headersValid ? "headers are valid" : "headers might be invalid"}, but no actual data rows were found (Total data rows: {excelValidationState.totalDataRows ?? 0}).
              Please ensure your file contains data after the header row.
            </p>
          </CardContent>
        </Card>
      );
    }

    // Headers valid, has data, no error -> Show preview
    if (excelValidationState.headersValid && excelValidationState.hasData && excelValidationState.previewData && excelValidationState.previewData.length > 0) {
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
               Displaying {dataRows.length} row(s) for preview from a total of {excelValidationState.totalDataRows} data row(s) found.
               All valid rows will be processed upon submission.
             </p>
           )}
        </div>
      );
    }
    
    return (
        <Card>
            <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                    File processed. Current state is unexpected. Please check the file or try again.
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

      {/* Show FileUploadZone only if no file is active OR if the active file had an error from FileUploadZone itself, AND not globally processing */}
      { !isProcessing && (!uploadedFileState || uploadedFileState.status === 'idle' || uploadedFileState.status === 'error' ) && (
        <FileUploadZone onFileAccepted={onFileChange} />
      )}
      
      {/* Show file info if a file has been selected (even if processing, but remove button will be disabled) */}
      { uploadedFileState && uploadedFileState.status !== 'idle' && renderFileInfoSection() }

      {/* Show validation/preview only if NOT globally processing AND file was "successfully" handled by dropzone */}
      { !isProcessing && uploadedFileState && uploadedFileState.status === 'success' && (
        <>
          {renderValidationAndPreviewSection()}
        </>
      )}
    </div>
  );
}

