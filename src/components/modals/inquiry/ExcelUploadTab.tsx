
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
    if (!uploadedFileState || uploadedFileState.status === 'idle' || isProcessingGlobal) {
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
            {uploadedFileState.status === 'success' && excelValidationState && (
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
         {uploadedFileState.status === 'success' && excelValidationState && !isProcessingGlobal && (
          <div className="mt-3 pt-3 border-t">
            {excelValidationState.error && (
              <Card className="border-destructive bg-destructive/10">
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="flex items-center text-destructive text-sm">
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    유효성 검사 오류
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-destructive text-xs">{excelValidationState.error}</p>
                  {excelValidationState.previewData && excelValidationState.previewData.length > 0 && (
                    <p className="text-xs text-destructive mt-1">
                      아래 미리보기는 부분적이거나 잘못된 데이터를 표시할 수 있습니다.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {!excelValidationState.error && !excelValidationState.hasData && excelValidationState.headersValid && (
              <Card className="border-orange-500 bg-orange-500/10">
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="flex items-center text-orange-600 text-sm">
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    데이터 행 없음
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-orange-700 text-xs">
                    Excel 파일 헤더는 유효하지만, 그 아래에 데이터 행이 없습니다. (총 데이터 행: {excelValidationState.totalDataRows ?? 0}).
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    );
  };
  
  const renderPreviewTable = () => {
    if (isProcessingGlobal || !uploadedFileState || uploadedFileState.status !== 'success' || !excelValidationState || excelValidationState.error || !excelValidationState.hasData || !excelValidationState.previewData) {
      return null;
    }
    
    const dataForPreviewTable = excelValidationState.previewData;
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
                미리보기에 {displayRows.length}개 행 표시 중 (파일 내 총 데이터 행 {excelValidationState.totalDataRows}개 - 헤더 제외). 
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
          Excel 템플릿
        </Button>
      </div>
      
      {isProcessingGlobal && (
         <div className="flex flex-col items-center justify-center w-full h-[185px] border-2 border-dashed rounded-lg border-primary/50 bg-primary/10 p-4">
            <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
            <p className="text-sm text-primary">파일 처리 중...</p>
            {uploadedFileState?.file && (
                <p className="text-xs text-primary/80 mt-1">
                    ({((uploadedFileState.file.size || 0) / 1024).toFixed(1)}KB)
                </p>
            )}
         </div>
      )}
      
      {!isProcessingGlobal && (!uploadedFileState || uploadedFileState.status === 'idle') && (
        <FileUploadZone onFileAccepted={onFileChange} disabled={false} />
      )}
      
      {!isProcessingGlobal && uploadedFileState && uploadedFileState.status !== 'idle' && renderFileInfo()}

      {!isProcessingGlobal && uploadedFileState?.status === 'success' && renderPreviewTable()}
    </div>
  );
}
