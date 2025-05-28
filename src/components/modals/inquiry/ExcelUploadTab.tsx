
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle, CheckCircle2, FileText, XCircle, Loader2 } from 'lucide-react';
import { FileUploadZone } from './FileUploadZone';
import type { UploadedFile, ExcelValidationResult } from '@/types';
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
  onFileChange: (file: UploadedFile | null) => void;
  isProcessingGlobal: boolean;
  uploadedFileState: UploadedFile | null;
  excelValidationState: ExcelValidationResult | null;
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
  onFileChange,
  isProcessingGlobal,
  uploadedFileState,
  excelValidationState,
}: ExcelUploadTabProps) {
  
  const renderTime = new Date().toISOString();
  console.log(`ExcelUploadTab Rendering. Props:`, { 
    renderTime,
    isProcessing: isProcessingGlobal, 
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
      console.log("[ExcelUploadTab handleRemoveFile] Calling onFileChange(null)");
      onFileChange(null); 
    }
  };

  const renderFileInfo = () => {
    if (!uploadedFileState || uploadedFileState.status === 'idle') {
        return null;
    }
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
            {uploadedFileState.status === 'success' && !isProcessingGlobal && excelValidationState && (
              excelValidationState.isValid && excelValidationState.hasData ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" title="파일 유효 및 데이터 존재" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-destructive" title={excelValidationState.error || "파일 유효성 검사 문제"} />
              )
            )}
            {uploadedFileState.status === 'error' && (
              <AlertTriangle className="w-5 h-5 text-destructive" title={uploadedFileState.errorMessage || "파일 업로드 오류"} />
            )}
            
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isProcessingGlobal} aria-label="파일 제거">
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

  const renderValidationAndPreview = () => {
    if (isProcessingGlobal || !uploadedFileState || uploadedFileState.status !== 'success' || !excelValidationState) {
      return null;
    }

    if (excelValidationState.error) { 
      return (
        <Card className="border-destructive bg-destructive/10 mt-0">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center text-destructive text-base">
              <AlertTriangle className="mr-2 h-5 w-5" />
              유효성 검사 오류
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-destructive text-sm">{excelValidationState.error}</p>
            {excelValidationState.previewData && excelValidationState.previewData.length > 0 && (
                <>
                    <p className="text-xs text-destructive mt-1">
                        미리보기는 부분적이거나 잘못된 데이터를 표시할 수 있습니다.
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
              데이터 행 없음
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-orange-700 text-sm">
              Excel 파일 헤더는 유효하지만, 그 아래에 데이터 행이 없습니다. 
              (워커가 찾은 총 데이터 행: {excelValidationState.totalDataRows ?? 0}).
            </p>
            {excelValidationState.previewData && excelValidationState.previewData.length > 0 && (
                renderPreviewTable(excelValidationState.previewData, excelValidationState.totalDataRows)
            )}
          </CardContent>
        </Card>
      );
    }

    if (excelValidationState.isValid && excelValidationState.hasData && excelValidationState.previewData) {
        return renderPreviewTable(excelValidationState.previewData, excelValidationState.totalDataRows);
    }
    
    // Fallback for unexpected states, can be more specific if needed
    if (uploadedFileState?.status === 'success' && excelValidationState) {
        return (
            <Card className="mt-0">
                <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                        파일이 처리되었습니다. 유효성 검사 결과를 기다리거나 예상치 못한 상태가 발생했습니다.
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
        <div className="space-y-2 mt-0">
            <h3 className="text-base font-semibold">데이터 미리보기:</h3>
            <ScrollArea className="border rounded-md shadow-sm bg-card h-[300px] sm:h-[calc(100vh-600px)] md:h-[calc(100vh-500px)] min-h-[200px]">
            <div className="overflow-auto">
                <Table className="min-w-full text-sm">
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                    {headers.map((header, index) => (
                        <TableHead key={`header-${index}`} className="px-3 py-2 whitespace-nowrap font-semibold">
                        {String(header) || `열 ${index + 1}`}
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
                        {/* Ensure all rows have the same number of cells as headers for consistent layout */}
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
                미리보기에 {displayRows.length}개 행 표시 중 (파일 내 총 데이터 행 {totalDataRowsInFile}개 - 헤더 제외). 
                모든 유효한 데이터 행은 제출 시 처리됩니다.
            </p>
            )}
        </div>
    );
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
          excel 양식
        </Button>
      </div>
      
      {(!uploadedFileState || uploadedFileState.status === 'idle') && !isProcessingGlobal && (
        <FileUploadZone onFileAccepted={onFileChange} disabled={isProcessingGlobal} />
      )}
      
      {uploadedFileState && uploadedFileState.status !== 'idle' && renderFileInfo()}

      {!isProcessingGlobal && uploadedFileState?.status === 'success' && renderValidationAndPreview()}
    </div>
  );
}
