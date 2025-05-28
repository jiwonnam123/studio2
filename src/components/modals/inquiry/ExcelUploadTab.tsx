
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { FileUploadZone } from './FileUploadZone';
import type { UploadedFile } from '@/types/inquiry';
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
  uploadedFileState: UploadedFile | null; // Renamed to avoid conflict
  onFileAccepted: (file: UploadedFile) => void;
}

const customColumnHeaders = [
  "캠페인 키",
  "캠페인 명",
  "ADID / IDFA",
  "이름",
  "연락처",
  "비고"
];

const MAX_PREVIEW_ROWS = 10; // Maximum number of data rows to show in preview

export function ExcelUploadTab({ uploadedFileState, onFileAccepted }: ExcelUploadTabProps) {
  const [previewData, setPreviewData] = useState<string[][] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

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
    setParseError(null);

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
            setParseError("The Excel file is empty or could not be read.");
            setIsParsing(false);
            return;
          }

          const headersFromExcel = jsonData[0] as string[];
          if (headersFromExcel.length !== customColumnHeaders.length || 
              !headersFromExcel.every((header, index) => header?.trim() === customColumnHeaders[index]?.trim())) {
            setParseError(`Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.join(", ")}". Please use the provided template.`);
            setIsParsing(false);
            // Still show preview of what was parsed, if possible
            setPreviewData(jsonData.slice(0, MAX_PREVIEW_ROWS + 1)); // show headers + N rows
            return;
          }
          
          setPreviewData(jsonData); // Show all data if headers are valid
          setParseError(null); // Clear any previous error if parsing is successful

        } catch (e: any) {
          console.error("Error parsing Excel file:", e);
          setParseError(`Error parsing Excel file: ${e.message || 'Unknown error'}`);
          setPreviewData(null);
        } finally {
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        setParseError("Failed to read the file.");
        setIsParsing(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (e: any) {
      console.error("Error initiating file read:", e);
      setParseError(`Error reading file: ${e.message}`);
      setIsParsing(false);
    }
  }, []);

  useEffect(() => {
    if (uploadedFileState && uploadedFileState.file && uploadedFileState.status === 'success') {
      processFile(uploadedFileState.file);
    } else if (!uploadedFileState || uploadedFileState.status === 'idle' || uploadedFileState.status === 'error'){
        // Clear preview if file is removed or has an upload error
        setPreviewData(null);
        setParseError(null);
        setIsParsing(false);
    }
  }, [uploadedFileState, processFile]);

  return (
    <div className="space-y-6 py-2">
      <div className="flex justify-end items-center">
        <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          Download Excel Template
        </Button>
      </div>
      
      <FileUploadZone onFileAccepted={onFileAccepted} />

      {isParsing && (
        <div className="flex items-center justify-center p-4 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Parsing and validating Excel file...
        </div>
      )}

      {parseError && !isParsing && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive text-lg">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Validation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{parseError}</p>
            {previewData && previewData.length > 0 && (
                 <p className="text-destructive mt-2">Some data was parsed, but it does not match the required format. Please review the preview below and your Excel file.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!isParsing && !parseError && previewData && previewData.length > 0 && (
         <Card className="border-green-500 bg-green-500/10">
          <CardHeader>
            <CardTitle className="flex items-center text-green-700 text-lg">
              <CheckCircle className="mr-2 h-5 w-5" />
              Excel Data Preview (Headers Valid)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-600 mb-2">
              File headers match the template. Displaying up to {MAX_PREVIEW_ROWS} data rows (plus headers).
            </p>
          </CardContent>
        </Card>
      )}


      {previewData && previewData.length > 0 && !isParsing && (
        <div className="space-y-2 mt-4">
          <h3 className="text-lg font-semibold">Parsed Data Preview:</h3>
          <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px]"> {/* Fixed height for scroll area */}
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
                  {previewData.slice(1, MAX_PREVIEW_ROWS + 1).map((row, rowIndex) => ( // Display MAX_PREVIEW_ROWS data rows
                    <TableRow key={`row-${rowIndex}`} className={rowIndex % 2 === 1 ? "bg-muted/20" : ""}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[200px]">
                          {String(cell)}
                        </TableCell>
                      ))}
                      {/* Fill empty cells if row has fewer columns than header */}
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
           {previewData.length -1 > MAX_PREVIEW_ROWS && (
            <p className="text-xs text-muted-foreground mt-1">
                Showing first {MAX_PREVIEW_ROWS} of {previewData.length - 1} data rows.
            </p>
        )}
        </div>
      )}
    </div>
  );
}
