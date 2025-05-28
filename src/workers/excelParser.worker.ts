
// src/workers/excelParser.worker.ts
import * as XLSX from 'xlsx';
import type { UploadedFile } from '@/types/inquiry'; // For File object if needed
import type { WorkerParseResponse } from '@/types/inquiry';

const PREVIEW_ROWS_LIMIT = 20;
const EXPECTED_COLUMNS = 6;
const customColumnHeaders = [
  "캠페인 키", "캠페인 명", "ADID / IDFA",
  "이름", "연락처", "비고"
];

self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  console.time('[Worker] ExcelParsing');
  const { file } = event.data;

  const startTime = performance.now();
  const fileSize = file.size;
  const isLargeFile = fileSize > 5 * 1024 * 1024; // 5MB

  let response: WorkerParseResponse = {
    success: false,
    error: null,
    previewData: null,
    fullData: null,
    totalDataRows: 0,
    headersValid: false,
    dataExistsInSheet: false,
    fileSize,
    processingTime: 0,
    isLargeFile,
  };

  if (!file) {
    response.error = 'Worker: No file received.';
    response.processingTime = performance.now() - startTime;
    console.timeEnd('[Worker] ExcelParsing');
    self.postMessage(response);
    return;
  }

  try {
    console.log("[Worker] Starting to process file:", file.name);
    const arrayBuffer = await file.arrayBuffer();
    
    // Optimized XLSX read options based on prompt
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellStyles: false,
      cellFormula: false,
      cellHTML: false,
      dense: false, // Prompt suggests false for speed over memory. Note: true might be faster for dense data.
      bookVBA: false,
      // bookSheets: true, // This only reads sheet names, not content. Cannot be used for parsing.
      raw: false // Default is false, minimizes type conversion attempts.
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      response.error = "Worker: No sheets found in the Excel file.";
      throw new Error(response.error);
    }

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet || !worksheet['!ref']) {
      response.error = "Worker: Sheet is empty or has no data range.";
      throw new Error(response.error);
    }

    // 1. Efficiently get total row count (header included) from sheet range
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const totalSheetRows = range.e.r + 1; // 0-indexed, so add 1
    response.totalDataRows = Math.max(0, totalSheetRows - 1); // Exclude header row

    // 2. Parse only a limited range for preview (including header)
    // This initial jsonData will be used for header validation and preview generation
    const previewEndRowIndex = Math.min(range.e.r, PREVIEW_ROWS_LIMIT); // 0-indexed end row for preview
    const previewRangeString = `${XLSX.utils.encode_cell({ r: 0, c: range.s.c })}:${XLSX.utils.encode_cell({ r: previewEndRowIndex, c: range.e.c })}`;
    
    const previewJsonData: any[][] = XLSX.utils.sheet_to_json<any>(worksheet, {
      header: 1,
      blankrows: false,
      dense: true, // For sheet_to_json, dense:true is often better for array of arrays.
      range: previewRangeString,
      defval: '', // Ensure empty cells are empty strings
    });

    if (!previewJsonData || previewJsonData.length === 0) {
      response.error = "Worker: The Excel file is empty or contains no data rows (based on preview parse).";
      response.previewData = [customColumnHeaders]; // Show expected headers if file is empty
    } else {
      const headersFromExcel = previewJsonData[0]?.map(header => String(header || '').trim()) || [];
      
      // Validate headers (must be exactly customColumnHeaders)
      if (headersFromExcel.length === customColumnHeaders.length &&
          customColumnHeaders.every((ch, index) => headersFromExcel[index] === ch)) {
        response.headersValid = true;
        
        // If headers are valid, now parse the *full data* for the 6 columns
        // We need all rows after the header, but only the first 6 columns.
        const fullDataRangeString = `${XLSX.utils.encode_cell({ r: 1, c: 0 })}:${XLSX.utils.encode_cell({ r: range.e.r, c: Math.min(range.e.c, EXPECTED_COLUMNS - 1) })}`;
        const allDataRowsJson: any[][] = XLSX.utils.sheet_to_json<any>(worksheet, {
          header: 1,
          blankrows: false,
          dense: true,
          range: range.e.r > 0 ? fullDataRangeString : undefined, // Only parse if data rows exist
          defval: '',
        });
        
        // Ensure each row in fullData has exactly EXPECTED_COLUMNS items
        response.fullData = allDataRowsJson.map(row => {
            const newRow = Array(EXPECTED_COLUMNS).fill('');
            for (let i = 0; i < EXPECTED_COLUMNS; i++) {
                if (row[i] !== undefined && row[i] !== null) {
                    newRow[i] = String(row[i]);
                }
            }
            return newRow;
        });

        response.totalDataRows = response.fullData.length; // Update totalDataRows based on full parse
        response.dataExistsInSheet = response.totalDataRows > 0;

        if (!response.dataExistsInSheet) {
          response.error = "Worker: Headers are valid, but no data rows were found beneath them.";
        }
        // Preview data will be the custom headers + a slice of the (potentially truncated by columns) fullData
        response.previewData = [customColumnHeaders, ...response.fullData.slice(0, PREVIEW_ROWS_LIMIT)];

      } else {
        response.headersValid = false;
        response.error = `Worker: Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.slice(0, customColumnHeaders.length).join(", ")}". Please use the provided template.`;
        // For invalid headers, preview the first few rows of original data to help user identify issue
        response.previewData = previewJsonData.slice(0, PREVIEW_ROWS_LIMIT + 1);
        response.dataExistsInSheet = false; // If headers invalid, consider no valid data
        response.fullData = null;
      }
    }
    
    response.success = response.headersValid && response.dataExistsInSheet && !response.error;

  } catch (e: any) {
    console.error("[Worker] Error parsing Excel file:", e);
    response.error = `Worker: Error parsing Excel file: ${e.message || 'Unknown error'}`;
    response.success = false;
    response.previewData = null;
    response.fullData = null;
    response.headersValid = false;
    response.dataExistsInSheet = false;
    response.totalDataRows = 0;
  } finally {
    response.processingTime = performance.now() - startTime;
    const loggableResponse = {
      ...response, 
      previewData: `Preview [${response.previewData?.length || 0} rows]`, 
      fullData: `Full [${response.fullData?.length || 0} rows]`
    };
    console.log("[Worker] Posting message:", JSON.stringify(loggableResponse, null, 2).substring(0, 1000));
    console.timeEnd('[Worker] ExcelParsing');
    self.postMessage(response);
  }
};
