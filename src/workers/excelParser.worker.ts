
// src/workers/excelParser.worker.ts
import * as XLSX from 'xlsx';
import type { WorkerParseResponse } from '@/types/inquiry';

const PREVIEW_ROWS_LIMIT = 20; // 미리보기 행 수 제한

const customColumnHeaders = [
  "캠페인 키", "캠페인 명", "ADID / IDFA",
  "이름", "연락처", "비고"
];

export interface WorkerParseRequest {
  file: File;
}

self.onmessage = async (event: MessageEvent<WorkerParseRequest>) => {
  const { file } = event.data;
  const startTime = performance.now();
  const fileSize = file.size;
  const isLargeFile = fileSize > 5 * 1024 * 1024; // 5MB threshold

  let response: WorkerParseResponse = {
    success: false,
    error: 'An unexpected error occurred in the worker.',
    previewData: null,
    totalDataRows: 0,
    headersValid: false,
    dataExistsInSheet: false,
    fileSize,
    isLargeFile,
    processingTime: 0,
  };

  if (!file) {
    response.error = 'No file received by worker.';
    response.processingTime = performance.now() - startTime;
    self.postMessage(response);
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellStyles: false,
      cellFormula: false,
      cellHTML: false,
      dense: true,
      bookVBA: false,
    });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      response.error = "No sheets found in the Excel file.";
      response.processingTime = performance.now() - startTime;
      self.postMessage(response);
      return;
    }

    const worksheet = workbook.Sheets[sheetName];
    const sheetRef = worksheet['!ref'];
    if (!sheetRef) {
      response.error = "Sheet is empty or has no data range.";
      response.processingTime = performance.now() - startTime;
      self.postMessage(response);
      return;
    }
    
    const range = XLSX.utils.decode_range(sheetRef);
    const totalRowsInSheet = range.e.r + 1; // Total rows including header (0-indexed)
    const actualTotalDataRows = Math.max(0, totalRowsInSheet - 1); // Exclude header row
    response.totalDataRows = actualTotalDataRows;

    const previewEndRowForParsing = Math.min(range.e.r, PREVIEW_ROWS_LIMIT);
    const previewRangeString = XLSX.utils.encode_range({
        s: { r: 0, c: range.s.c },
        e: { r: previewEndRowForParsing, c: range.e.c }
    });
    
    const jsonData: any[][] = XLSX.utils.sheet_to_json<any>(worksheet, { 
      header: 1, 
      blankrows: false,
      dense: true,
      range: previewRangeString 
    });
    response.previewData = jsonData;


    if (!jsonData || jsonData.length === 0) {
      response.error = "The Excel file is empty or could not be read (no data in preview range).";
      response.headersValid = false;
      response.dataExistsInSheet = false; // Even if actualTotalDataRows > 0, if preview is empty, treat as error for now
    } else {
      const headersFromExcel = jsonData[0] as string[];
      if (!headersFromExcel || headersFromExcel.length === 0) {
        response.error = "The Excel file is missing a header row.";
        response.headersValid = false;
      } else if (
        headersFromExcel.length !== customColumnHeaders.length ||
        !headersFromExcel.every((header, index) => String(header || '').trim() === customColumnHeaders[index]?.trim())
      ) {
        response.error = `Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.map(h => String(h || '').trim()).join(", ")}". Please use the template.`;
        response.headersValid = false;
      } else {
        response.headersValid = true;
        response.error = null; // No header error
      }
      response.dataExistsInSheet = response.headersValid && actualTotalDataRows > 0;
    }
    
    response.success = !response.error && response.headersValid && response.dataExistsInSheet;

  } catch (e: any) {
    console.error("[Worker] Error parsing Excel file:", e);
    response.error = `Error parsing Excel file: ${e.message || 'Unknown worker error'}`;
    response.success = false;
    response.previewData = null; // Clear preview on error
    response.headersValid = false;
    response.dataExistsInSheet = false;
  } finally {
    response.processingTime = performance.now() - startTime;
    console.log("[Worker] Posting message to main thread:", response);
    self.postMessage(response);
  }
};
