
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
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

interface ExcelUploadTabProps {
  uploadedFileState: UploadedFile | null;
  onFileChange: (file: UploadedFile | null) => void; // Callback to update file in modal
  onValidationComplete: (result: ExcelValidationResult) => void; // Callback for validation result
}

const customColumnHeaders = [
  "캠페인 키",
  "캠페인 명",
  "ADID / IDFA",
  "이름",
  "연락처",
  "비고"
];

const MAX_PREVIEW_ROWS = 10; 

export function ExcelUploadTab({ uploadedFileState, onFileChange, onValidationComplete }: ExcelUploadTabProps) {
  const [previewData, setPreviewData] = useState<string[][] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  // parseError state is now managed by onValidationComplete communication to parent

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/inquiry_template.xlsx'; 
    link.setAttribute('download', 'inquiry_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = useCallback(async (file: File) => {
    setIsParsing(true);
    setPreviewData(null);
    let validationResult: ExcelValidationResult = { error: null, hasData: false };

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
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, blankrows: false });

          if (!jsonData || jsonData.length === 0) {
            validationResult = { error: "The Excel file is empty or could not be read.", hasData: false };
          } else {
            const headersFromExcel = jsonData[0] as string[];
            if (headersFromExcel.length !== customColumnHeaders.length || 
                !headersFromExcel.every((header, index) => header?.trim() === customColumnHeaders[index]?.trim())) {
              validationResult = { 
                error: `Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.join(", ")}". Please use the provided template.`, 
                hasData: jsonData.length > 1 
              };
              // Still show preview of what was parsed, if possible
              setPreviewData(jsonData.slice(0, MAX_PREVIEW_ROWS + 1)); 
            } else {
              setPreviewData(jsonData); 
              validationResult = { error: null, hasData: jsonData.length > 1 };
            }
          }
        } catch (e: any) {
          console.error("Error parsing Excel file:", e);
          validationResult = { error: `Error parsing Excel file: ${e.message || 'Unknown error'}`, hasData: false };
          setPreviewData(null);
        } finally {
          setIsParsing(false);
          onValidationComplete(validationResult);
        }
      };
      reader.onerror = () => {
        validationResult = { error: "Failed to read the file.", hasData: false };
        setIsParsing(false);
        onValidationComplete(validationResult);
      };
      reader.readAsArrayBuffer(file);
    } catch (e: any) {
      console.error("Error initiating file read:", e);
      validationResult = { error: `Error reading file: ${e.message}`, hasData: false };
      setIsParsing(false);
      onValidationComplete(validationResult);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onValidationComplete]); // processFile depends on onValidationComplete

  useEffect(() => {
    if (uploadedFileState && uploadedFileState.file && uploadedFileState.status === 'success') {
      processFile(uploadedFileState.file);
    } else if (!uploadedFileState || uploadedFileState.status === 'idle' || uploadedFileState.status === 'error'){
        setPreviewData(null);
        setIsParsing(false);
        // If file is removed or has error, notify parent about validation (likely error or no data)
        if(uploadedFileState && uploadedFileState.status === 'error') {
             onValidationComplete({ error: uploadedFileState.errorMessage || "File upload error.", hasData: false });
        } else if (!uploadedFileState) {
            onValidationComplete({ error: null, hasData: false}); // No file, so no data, no error by default
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFileState, processFile]); // Re-run if file state or processFile changes

  const currentParseError = uploadedFileState?.status === 'success' && previewData === null && !isParsing 
    ? "File processed, but no preview data available (possibly empty or fully invalid after header)." 
    : null; 
    // This logic is now more complex as error is reported via onValidationComplete.
    // The UI will react to `uploadedFileState.errorMessage` or the error from `excelValidationState` in parent.


  return (
    <div className="space-y-6 py-2">
      <div className="flex justify-end items-center">
        <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          Download Excel Template
        </Button>
      </div>
      
      <FileUploadZone onFileAccepted={onFileChange} />

      {isParsing && (
        <div className="flex items-center justify-center p-4 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Parsing and validating Excel file...
        </div>
      )}

      {/* Error/Success messages are now primarily driven by parent's excelValidationState and uploadedFileState.errorMessage */}
      {/* This component will focus on rendering the preview if data is available. */}

      {uploadedFileState?.status === 'error' && uploadedFileState.errorMessage && !isParsing && (
         <Card className="border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive text-lg">
              <AlertTriangle className="mr-2 h-5 w-5" />
              File Upload Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{uploadedFileState.errorMessage}</p>
          </CardContent>
        </Card>
      )}
      
      {/* Logic for displaying validation messages or success based on parent state can be added here if needed, */}
      {/* or rely on the parent modal to show these messages based on excelValidationState. */}
      {/* For now, let's assume the parent (InquiryModal) handles high-level status display. */}


      {previewData && previewData.length > 0 && !isParsing && (
        <div className="space-y-2 mt-4">
          <h3 className="text-lg font-semibold">Parsed Data Preview:</h3>
          <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px]"> 
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
                  {previewData.slice(1, MAX_PREVIEW_ROWS + 1).map((row, rowIndex) => ( 
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
           {(previewData.length -1) > MAX_PREVIEW_ROWS && (
            <p className="text-xs text-muted-foreground mt-1">
                Showing first {MAX_PREVIEW_ROWS} of {previewData.length - 1} data rows.
            </p>
        )}
        </div>
      )}

      {uploadedFileState && uploadedFileState.status === 'success' && !previewData && !isParsing && (
        <div className="flex flex-col items-center justify-center p-4 text-muted-foreground border-2 border-dashed rounded-lg min-h-[100px]">
            <FileText className="w-8 h-8 mb-2"/>
            <p>File processed. Waiting for validation result or no data to preview.</p>
        </div>
      )}
      {!uploadedFileState && !isParsing && (
         <div className="flex flex-col items-center justify-center p-4 text-muted-foreground border-2 border-dashed rounded-lg min-h-[100px]">
            <FileText className="w-8 h-8 mb-2"/>
            <p>Upload an Excel file to see a preview.</p>
        </div>
      )}

    </div>
  );
}
