
// src/workers/excelParser.worker.ts
import * as XLSX from 'xlsx';
import type { WorkerParseResponse } from '@/types/inquiry';

const PREVIEW_ROWS_LIMIT = 20; // For UI preview, excluding header
const EXPECTED_COLUMNS = 6;
const customColumnHeaders = [
  "캠페인 키", "캠페인 명", "ADID / IDFA",
  "이름", "연락처", "비고"
];

const parseCSV = async (file: File): Promise<{jsonData: string[][], error: string | null}> => {
  try {
    const text = await file.text();
    const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== ''); // Filter out empty lines
    if (lines.length === 0) {
        return { jsonData: [], error: "CSV file is empty." };
    }
    // Simple CSV parsing: split by comma. Does not handle commas within quoted fields.
    const jsonData = lines.map(line => {
        // Basic handling for fields enclosed in double quotes that might contain commas
        const cells: string[] = [];
        let inQuotes = false;
        let currentCell = '';
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
                if (i + 1 < line.length && line[i+1] === '"') { // Handle "" as a single quote
                    currentCell += '"';
                    i++; // Skip next quote
                }
            } else if (char === ',' && !inQuotes) {
                cells.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        cells.push(currentCell.trim()); // Add the last cell
        return cells;
    });
    return { jsonData, error: null };
  } catch (e: any) {
    console.error("[Worker] Error parsing CSV:", e);
    return { jsonData: [], error: `Error reading CSV file: ${e.message || 'Unknown CSV parsing error'}` };
  }
};


self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  console.time('[Worker] FileParsing');
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
    response.error = '[Worker] No file received.';
    response.processingTime = performance.now() - startTime;
    console.timeEnd('[Worker] FileParsing');
    self.postMessage(response);
    return;
  }

  try {
    console.log("[Worker] Starting to process file:", file.name, "Type:", file.type);
    let rawJsonData: string[][] = [];
    let csvParseError: string | null = null;

    if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
        const csvResult = await parseCSV(file);
        rawJsonData = csvResult.jsonData;
        csvParseError = csvResult.error;
    } else { // Assume Excel
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellStyles: false,
            cellFormula: false,
            cellHTML: false,
            dense: false, // Prompt suggests false for speed. True might be better for dense, non-empty sheets.
            bookVBA: false,
            // bookSheets: true, // This only reads sheet names, not content.
        });

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            response.error = "[Worker] No sheets found in the Excel file.";
            throw new Error(response.error);
        }
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
             response.error = "[Worker] Excel Sheet is empty or unreadable.";
             throw new Error(response.error);
        }
        // For Excel, use sheet_to_json to get array of arrays, including headers
        rawJsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
            header: 1, // Generates an array of arrays
            blankrows: false, // Skip blank rows
            defval: '', // Ensure empty cells are empty strings
        });
    }

    if (csvParseError) {
        response.error = csvParseError;
        throw new Error(csvParseError);
    }
    
    if (!rawJsonData || rawJsonData.length === 0) {
      response.error = "[Worker] The file is empty or contains no data rows.";
      response.previewData = [customColumnHeaders]; // Show expected headers if file is empty
      response.headersValid = false; // Can't validate headers if no data
    } else {
      const headersFromSheet = rawJsonData[0]?.map(header => String(header || '').trim()) || [];
      
      // Validate headers (must be exactly customColumnHeaders and 6 columns)
      if (headersFromSheet.length === EXPECTED_COLUMNS &&
          customColumnHeaders.every((ch, index) => headersFromSheet[index] === ch)) {
        response.headersValid = true;
        
        const dataRowsOnly = rawJsonData.slice(1); // Exclude header row
        
        // Extract exactly 6 columns for fullData, pad with empty strings if necessary
        response.fullData = dataRowsOnly.map(row => {
            const newRow = Array(EXPECTED_COLUMNS).fill('');
            for (let i = 0; i < EXPECTED_COLUMNS; i++) {
                if (row[i] !== undefined && row[i] !== null) {
                    newRow[i] = String(row[i]);
                }
            }
            return newRow;
        }).filter(row => row.some(cell => cell !== '')); // Filter out rows that became all empty after processing

        response.totalDataRows = response.fullData.length;
        response.dataExistsInSheet = response.totalDataRows > 0;

        if (!response.dataExistsInSheet) {
          // This case might be redundant if we filter empty rows above, but good for clarity
          response.error = "[Worker] Headers are valid, but no actual data rows were found beneath them.";
        }
        
        // Preview data: custom headers + a slice of the fullData
        response.previewData = [customColumnHeaders, ...response.fullData.slice(0, PREVIEW_ROWS_LIMIT)];

      } else {
        response.headersValid = false;
        const foundHeadersPreview = headersFromSheet.slice(0, EXPECTED_COLUMNS).join(", ");
        response.error = `[Worker] Invalid headers. Expected ${EXPECTED_COLUMNS} columns: "${customColumnHeaders.join(", ")}". Found ${headersFromSheet.length} columns, starting with: "${foundHeadersPreview}". Please use the provided template.`;
        
        // For invalid headers, preview the first few rows of original data to help user identify issue
        // Ensure previewData also has headers as the first row
        const previewWithOriginalHeader = rawJsonData.slice(0, PREVIEW_ROWS_LIMIT + 1);
        response.previewData = previewWithOriginalHeader.map(row => {
             const newRow = Array(Math.max(EXPECTED_COLUMNS, row.length)).fill('');
             row.forEach((cell, i) => newRow[i] = String(cell || ''));
             return newRow;
        });

        response.dataExistsInSheet = false; 
        response.fullData = null;
        response.totalDataRows = 0; // No valid data rows if headers are wrong
      }
    }
    
    response.success = response.headersValid && response.dataExistsInSheet && !response.error;

  } catch (e: any) {
    console.error("[Worker] Error parsing file:", file.name, e);
    // Ensure error message from response.error (if set by specific logic) is prioritized
    response.error = response.error || `[Worker] Error parsing file: ${e.message || 'Unknown error'}`;
    response.success = false;
    // Reset other fields if a catastrophic error occurred
    response.previewData = response.previewData || null; // Keep preview if it was set before error
    response.fullData = null;
    response.headersValid = response.headersValid || false; // Keep if headers were validated before error
    response.dataExistsInSheet = false;
    response.totalDataRows = 0;
  } finally {
    response.processingTime = performance.now() - startTime;
    const loggableResponse = {
      ...response, 
      previewData: `Preview [${response.previewData?.length || 0} rows, first row: ${JSON.stringify(response.previewData?.[0])}]`, 
      fullData: `Full [${response.fullData?.length || 0} rows]`
    };
    console.log("[Worker] Posting message:", JSON.stringify(loggableResponse, null, 2).substring(0, 1500)); // Increased log length
    console.timeEnd('[Worker] FileParsing');
    self.postMessage(response);
  }
};

