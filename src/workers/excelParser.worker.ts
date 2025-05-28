
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
  const isLargeFile = fileSize > 5 * 1024 * 1024; // 5MB threshold for large file flag

  if (!file) {
    self.postMessage({
      error: 'No file received by worker.',
      previewData: null,
      totalDataRows: 0,
      headersValid: false,
      dataExistsInSheet: false,
      fileSize,
      isLargeFile,
      processingTime: performance.now() - startTime,
    } as WorkerParseResponse);
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
      self.postMessage({
        error: "No sheets found in the Excel file.",
        previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
        fileSize, processingTime: performance.now() - startTime, isLargeFile,
      } as WorkerParseResponse);
      return;
    }

    const worksheet = workbook.Sheets[sheetName];
    const sheetRef = worksheet['!ref'];
    if (!sheetRef) {
        self.postMessage({
            error: "Sheet is empty or has no data range.",
            previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
            fileSize, processingTime: performance.now() - startTime, isLargeFile,
        } as WorkerParseResponse);
        return;
    }
    
    const range = XLSX.utils.decode_range(sheetRef);
    const totalRowsInSheet = range.e.r + 1; // Total rows including header (0-indexed)
    const actualTotalDataRows = Math.max(0, totalRowsInSheet - 1); // Exclude header row

    // For preview, parse only up to PREVIEW_ROWS_LIMIT data rows (+1 for header)
    // The range should not exceed the actual sheet dimensions
    const previewEndRowForParsing = Math.min(range.e.r, PREVIEW_ROWS_LIMIT); // Max row index for parsing preview
    const previewRangeString = XLSX.utils.encode_range({
        s: { r: 0, c: range.s.c }, // Start from header row
        e: { r: previewEndRowForParsing, c: range.e.c } // End at preview limit or sheet end
    });
    
    const previewJsonData: any[][] = XLSX.utils.sheet_to_json<any>(worksheet, { 
      header: 1, 
      blankrows: false, // Keep this to match original behavior of not skipping blank data rows
      dense: true,
      range: previewRangeString 
    });

    if (!previewJsonData || previewJsonData.length === 0) {
      self.postMessage({
        error: "The Excel file is empty or could not be read (no data in preview range).",
        previewData: null, totalDataRows: actualTotalDataRows, headersValid: false, 
        dataExistsInSheet: actualTotalDataRows > 0, // dataExistsInSheet depends on actualTotalDataRows
        fileSize, processingTime: performance.now() - startTime, isLargeFile,
      } as WorkerParseResponse);
      return;
    }

    const headersFromExcel = previewJsonData[0] as string[];
    let headersValid = false;
    let validationError: string | null = null;
    
    if (!headersFromExcel || headersFromExcel.length === 0) {
      validationError = "The Excel file is missing a header row.";
    } else if (
      headersFromExcel.length !== customColumnHeaders.length ||
      !headersFromExcel.every((header, index) => String(header || '').trim() === customColumnHeaders[index]?.trim())
    ) {
      validationError = `Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.map(h => String(h || '').trim()).join(", ")}". Please use the provided template.`;
    } else {
      headersValid = true;
    }

    // dataExistsInSheet should be true if headers are valid AND there are actual data rows in the full sheet
    const dataExistsInSheet = headersValid && actualTotalDataRows > 0;
    
    const processingTime = performance.now() - startTime;

    self.postMessage({
      error: validationError,
      previewData: previewJsonData, // Send only preview data
      totalDataRows: actualTotalDataRows, // Send total count of actual data rows
      headersValid: headersValid,
      dataExistsInSheet: dataExistsInSheet,
      fileSize,
      processingTime,
      isLargeFile,
    } as WorkerParseResponse);

  } catch (e: any) {
    const processingTime = performance.now() - startTime;
    self.postMessage({
      error: `Error parsing Excel file: ${e.message || 'Unknown error'}`,
      previewData: null, totalDataRows: 0, headersValid: false, dataExistsInSheet: false,
      fileSize, processingTime, isLargeFile,
    } as WorkerParseResponse);
  }
};
