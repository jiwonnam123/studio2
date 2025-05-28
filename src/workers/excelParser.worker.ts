
// src/workers/excelParser.worker.ts
import * as XLSX from 'xlsx';
import type { WorkerParseRequest, WorkerParseResponse } from '@/types/inquiry';

const PREVIEW_ROWS_LIMIT = 20; 
const customColumnHeaders = [
  "캠페인 키", "캠페인 명", "ADID / IDFA",
  "이름", "연락처", "비고"
]; 

self.onmessage = async (event: MessageEvent<WorkerParseRequest>) => {
  const { file } = event.data;
  const startTime = performance.now();
  const fileSize = file.size;
  const isLargeFile = fileSize > (5 * 1024 * 1024); 

  let response: WorkerParseResponse = {
    success: false,
    error: 'Worker: An unexpected error occurred.',
    previewData: null,
    fullData: null,
    totalDataRows: 0,
    headersValid: false,
    dataExistsInSheet: false,
    fileSize,
    isLargeFile,
    processingTime: 0,
  };

  if (!file) {
    response.error = 'Worker: No file received.';
    response.processingTime = performance.now() - startTime;
    self.postMessage(response);
    return;
  }

  try {
    console.log("[Worker] Starting to process file:", file.name);
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellStyles: false, cellFormula: false, cellHTML: false,
      dense: true, bookVBA: false,
    });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      response.error = "Worker: No sheets found in the Excel file.";
      self.postMessage(response); return;
    }

    const worksheet = workbook.Sheets[sheetName];
    const sheetRef = worksheet['!ref'];
    if (!sheetRef) {
      response.error = "Worker: Sheet is empty or has no data range.";
      self.postMessage(response); return;
    }
    
    const allRowsJson: any[][] = XLSX.utils.sheet_to_json<any>(worksheet, { 
      header: 1, blankrows: false, dense: true, defval: '',
    });

    if (!allRowsJson || allRowsJson.length === 0) {
      response.error = "Worker: The Excel file is empty or contains no data rows.";
    } else {
      const headersFromExcel = allRowsJson[0].map(header => String(header || '').trim());
      
      if (headersFromExcel.length < customColumnHeaders.length ||
          !customColumnHeaders.every((ch, index) => headersFromExcel[index] === ch)) {
        response.error = `Worker: Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.slice(0, customColumnHeaders.length).join(", ")}".`;
        response.headersValid = false;
        response.previewData = allRowsJson.slice(0, PREVIEW_ROWS_LIMIT + 1); 
      } else {
        response.headersValid = true;
        const dataRowsOnly = allRowsJson.slice(1);

        const extractedFullData = dataRowsOnly.map(row =>
          customColumnHeaders.map((_, colIndex) => String(row[colIndex] || ''))
        );
        
        response.fullData = extractedFullData;
        response.totalDataRows = extractedFullData.length;
        response.dataExistsInSheet = extractedFullData.length > 0;

        response.previewData = [
          customColumnHeaders, 
          ...extractedFullData.slice(0, PREVIEW_ROWS_LIMIT)
        ];
        
        if (!response.dataExistsInSheet) {
          response.error = "Worker: Headers are valid, but no data rows were found.";
        } else {
          response.error = null; 
        }
      }
    }
    
    response.success = response.headersValid && response.dataExistsInSheet && !response.error;

  } catch (e: any) {
    console.error("[Worker] Error parsing Excel file:", e);
    response.error = `Worker: Error parsing Excel file: ${e.message || 'Unknown error'}`;
    response.success = false; // Ensure success is false on catch
    // Reset other fields on critical error
    response.previewData = null; response.fullData = null; response.headersValid = false;
    response.dataExistsInSheet = false; response.totalDataRows = 0;
  } finally {
    response.processingTime = performance.now() - startTime;
    const loggableResponse = {...response, previewData: `Preview [${response.previewData?.length || 0} rows]`, fullData: `Full [${response.fullData?.length || 0} rows]`};
    console.log("[Worker] Posting message:", JSON.stringify(loggableResponse).substring(0, 500));
    self.postMessage(response);
  }
};
