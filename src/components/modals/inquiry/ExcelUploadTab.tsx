
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react';
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
  isProcessing: boolean; 
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
  isProcessing 
}: ExcelUploadTabProps) {

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/inquiry_template.xlsx';
    link.setAttribute('download', 'inquiry_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleRemoveFile = () => {
    if (!isProcessing) { // Do not allow removal if processing
        onFileChange(null); 
    }
  };
  
  const validationErrorToDisplay = excelValidationState?.error;
  const headersAreValid = excelValidationState?.headersValid;
  const dataExists = excelValidationState?.hasData; // Renamed from hasData to avoid conflict with prop name
  const previewData = excelValidationState?.previewData;
  const totalDataRowsInFile = excelValidationState?.totalDataRows; // From worker: actual data rows in file

  // If processing, this tab's content will be minimal as loader is in Modal's header
  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center p-6 min-h-[300px] h-full">
        {/* Content is hidden while processing, main loader is in DialogHeader */}
         <p className="text-sm text-muted-foreground">Processing your file...</p>
      </div>
    );
  }

  // If no file uploaded yet, or file was removed (and not processing)
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
  
  // Display file info, validation results, and preview if a file is present and not processing
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
            {uploadedFileState.status === 'success' && headersAreValid && dataExists && !validationErrorToDisplay && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {(uploadedFileState.status === 'error' || validationErrorToDisplay || (headersAreValid && !dataExists && !validationErrorToDisplay)) && <AlertTriangle className="w-5 h-5 text-destructive" />}
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isProcessing}>
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
              {previewData && previewData.length > 0 && (
                <p className="text-xs text-destructive mt-1">Showing first {previewData.length-1} rows of the problematic file for context.</p>
              )}
          </CardContent>
          </Card>
      )}
      
      {!validationErrorToDisplay && headersAreValid && !dataExists && (
          <Card className="border-orange-500 bg-orange-500/10">
              <CardHeader>
              <CardTitle className="flex items-center text-orange-600 text-base">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  No Data To Submit
              </CardTitle>
              </CardHeader>
              <CardContent>
              <p className="text-orange-700 text-sm">The Excel file headers are valid, but no data rows were found (Total data rows: {totalDataRowsInFile ?? 0}). Please ensure your file contains data after the header row.</p>
              </CardContent>
          </Card>
      )}

      {!validationErrorToDisplay && headersAreValid && dataExists && previewData && previewData.length > 0 && (
          <div className="space-y-2 mt-4">
          <h3 className="text-base font-semibold">Data Preview:</h3>
          <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-650px)] md:h-[calc(100vh-550px)] min-h-[200px]"> {/* Adjusted height for better fit */}
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
                  {/* previewData now only contains up to PREVIEW_ROWS_LIMIT + 1 (for header) */}
                  {previewData.slice(1).map((row, rowIndex) => (
                      <TableRow key={`row-${rowIndex}`} className={rowIndex % 2 === 1 ? "bg-muted/20" : ""}>
                      {row.map((cell, cellIndex) => (
                          <TableCell key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[180px]">
                          {String(cell)}
                          </TableCell>
                      ))}
                      {previewData[0] && Array.from({ length: Math.max(0, previewData[0].length - row.length) }).map((_, emptyCellIndex) => (
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
                  Displaying {previewData.length -1} row(s) for preview from a total of {totalDataRowsInFile} data row(s) found in the file. All rows will be processed.
              </p>
          )}
          </div>
      )}
    </div>
  );
}
