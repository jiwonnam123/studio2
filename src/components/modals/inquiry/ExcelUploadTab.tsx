
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react';
import { FileUploadZone } from './FileUploadZone';
import type { UploadedFile, ExcelValidationResult } from '@/types/inquiry';
import * as XLSX from 'xlsx';
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

const customColumnHeaders = [
  "캠페인 키",
  "캠페인 명",
  "ADID / IDFA",
  "이름",
  "연락처",
  "비고"
];

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

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/inquiry_template.xlsx';
    link.setAttribute('download', 'inquiry_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = useCallback(async (file: File) => {
    if (isParsing) return;
    setIsParsing(true);
    setPreviewData(null);
    setTotalDataRowsAfterParse(0);
    let validationResult: ExcelValidationResult = { error: null, hasData: false, totalDataRows: 0 };

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const arrayBuffer = event.target?.result;
          if (!arrayBuffer) {
            throw new Error("Failed to read file buffer.");
          }
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
             throw new Error("No sheets found in the Excel file.");
          }
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, blankrows: false });

          const actualDataRows = jsonData.length > 1 ? jsonData.length - 1 : 0;
          setTotalDataRowsAfterParse(actualDataRows);

          if (!jsonData || jsonData.length === 0) {
            validationResult = { error: "The Excel file is empty or could not be read.", hasData: false, totalDataRows: 0 };
          } else {
            const headersFromExcel = jsonData[0] as string[];
            if (!headersFromExcel || headersFromExcel.length === 0) {
                validationResult = { error: "The Excel file is missing headers.", hasData: false, totalDataRows: actualDataRows };
            } else if (headersFromExcel.length !== customColumnHeaders.length ||
                !headersFromExcel.every((header, index) => header?.trim() === customColumnHeaders[index]?.trim())) {
              validationResult = {
                error: `Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.join(", ")}". Please use the provided template.`,
                hasData: actualDataRows > 0,
                totalDataRows: actualDataRows
              };
              setPreviewData(jsonData); 
            } else {
              setPreviewData(jsonData); 
              validationResult = { error: null, hasData: actualDataRows > 0, totalDataRows: actualDataRows };
            }
          }
        } catch (e: any) {
          console.error("Error parsing Excel file:", e);
          validationResult = { error: `Error parsing Excel file: ${e.message || 'Unknown error'}`, hasData: false, totalDataRows: 0 };
          setPreviewData(null);
        } finally {
          setIsParsing(false);
          onValidationComplete(validationResult);
        }
      };
      reader.onerror = () => {
        validationResult = { error: "Failed to read the file.", hasData: false, totalDataRows: 0 };
        setIsParsing(false);
        onValidationComplete(validationResult);
      };
      reader.readAsArrayBuffer(file);
    } catch (e: any) {
      console.error("Error initiating file read:", e);
      validationResult = { error: `Error reading file: ${e.message}`, hasData: false, totalDataRows: 0 };
      setIsParsing(false);
      onValidationComplete(validationResult);
    }
  }, [isParsing, onValidationComplete]); // Removed processFile from its own dependency array for stability, it's a stable function now

  useEffect(() => {
    if (uploadedFileState?.file && uploadedFileState.status === 'success') {
      processFile(uploadedFileState.file);
    } else if (uploadedFileState && uploadedFileState.status === 'uploading') {
      // While "uploading" (simulated), clear local preview but don't affect parent's validation state yet
      setIsParsing(true); // Show parsing UI even for simulated upload
      setPreviewData(null);
      setTotalDataRowsAfterParse(0);
    } else {
      // File is removed, or error in FileUploadZone, or idle
      setIsParsing(false);
      setPreviewData(null);
      setTotalDataRowsAfterParse(0);
      // Only call onValidationComplete if there's no active file or an initial error from FileUploadZone
      if (!uploadedFileState || uploadedFileState.status === 'error' || uploadedFileState.status === 'idle') {
        onValidationComplete({ error: uploadedFileState?.errorMessage || null, hasData: false, totalDataRows: 0 });
      }
    }
  }, [uploadedFileState, processFile, onValidationComplete]);


  const validationErrorToDisplay = excelValidationState?.error;
  const isSuccessAndHasData = uploadedFileState?.status === 'success' && !validationErrorToDisplay && excelValidationState?.hasData;
  const hasPreviewableData = previewData && previewData.length > 1; // Header + at least one data row

  const handleRemoveFile = () => {
    onFileChange(null); // This will trigger the useEffect above to clear states
  };

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
       {/* Section for Download Template and File Upload Zone / File Info */}
      {!uploadedFileState || uploadedFileState.status === 'idle' || uploadedFileState.status === 'error' ? (
        // Show download button and FileUploadZone when no file is active or if there was an error in upload zone
        <>
          <div className="flex justify-end items-center">
            <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Download Excel Template
            </Button>
          </div>
          <FileUploadZone onFileAccepted={onFileChange} />
          {uploadedFileState?.status === 'error' && uploadedFileState.errorMessage && (
            <div className="p-4 border rounded-lg bg-destructive/10 text-destructive text-sm">
              <div className="flex items-center space-x-3">
                <FileText className="w-6 h-6" />
                <div>
                  <p className="font-medium truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                    {uploadedFileState.name} ({formatBytes(uploadedFileState.size)})
                  </p>
                  <p>{uploadedFileState.errorMessage}</p>
                </div>
                <XCircle className="w-5 h-5 ml-auto" />
              </div>
            </div>
          )}
        </>
      ) : (
        // Show file info and remove button when a file is successfully "uploaded" (selected)
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
              {uploadedFileState.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
                <XCircle className="w-5 h-5 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Validation and Preview Section - only shown if a file was processed */}
      {uploadedFileState && uploadedFileState.status === 'success' && (
        <>
          {validationErrorToDisplay && (
            <Card className="border-destructive bg-destructive/10">
              <CardHeader>
                <CardTitle className="flex items-center text-destructive text-lg">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  Validation Error
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive">{validationErrorToDisplay}</p>
                {excelValidationState?.totalDataRows === 0 && <p className="text-destructive mt-1">No data rows found.</p>}
              </CardContent>
            </Card>
          )}

          {isSuccessAndHasData && (
            <Card className="border-green-500 bg-green-500/10">
              <CardHeader>
                <CardTitle className="flex items-center text-green-600 text-lg">
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  File Valid & Ready
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-green-700">The uploaded Excel file is valid and contains {excelValidationState?.totalDataRows} data row(s). Preview below.</p>
              </CardContent>
            </Card>
          )}

          {!isSuccessAndHasData && !validationErrorToDisplay && excelValidationState && !excelValidationState.hasData && (
            <Card className="border-orange-500 bg-orange-500/10">
              <CardHeader>
                <CardTitle className="flex items-center text-orange-600 text-lg">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  No Data Found
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-orange-700">The Excel file headers are valid, but no data rows were found to submit.</p>
              </CardContent>
            </Card>
          )}

          {hasPreviewableData && (
            <div className="space-y-2 mt-4">
              <h3 className="text-lg font-semibold">Data Preview:</h3>
              <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-600px)] md:h-[300px] min-h-[200px]">
                <div className="overflow-auto">
                  <Table className="min-w-full text-sm">
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                      <TableRow>
                        {previewData[0].map((header, index) => (
                          <TableHead key={`header-${index}`} className="px-3 py-2 whitespace-nowrap font-semibold">
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
                    Displaying all {totalDataRowsAfterParse} data row(s).
                </p>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Placeholder when no file is uploaded and not parsing, and not in an error state from FileUploadZone */}
      {!isParsing && !uploadedFileState && !previewData && (
         <div className="flex flex-col items-center justify-center p-4 text-muted-foreground border-2 border-dashed rounded-lg min-h-[100px]">
            <FileText className="w-8 h-8 mb-2"/>
            <p>Upload an Excel file to see a preview.</p>
        </div>
      )}
    </div>
  );
}

