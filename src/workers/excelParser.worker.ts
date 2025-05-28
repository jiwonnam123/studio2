
// src/workers/excelParser.worker.ts
import * as XLSX from 'xlsx';

// Define expected header structure also in the worker
const customColumnHeaders = [
  "캠페인 키", "캠페인 명", "ADID / IDFA",
  "이름", "연락처", "비고"
];

export interface WorkerParseRequest {
  file: File;
}

export interface WorkerParseResponse {
  error: string | null;
  previewData: string[][] | null; // jsonData (array of arrays)
  totalDataRows: number;
  headersValid: boolean;
  dataExistsInSheet: boolean; // True if there are rows beyond the header
}

self.onmessage = async (event: MessageEvent<WorkerParseRequest>) => {
  const { file } = event.data;

  if (!file) {
    self.postMessage({
      error: 'No file received by worker.',
      previewData: null,
      totalDataRows: 0,
      headersValid: false,
      dataExistsInSheet: false,
    } as WorkerParseResponse);
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      self.postMessage({
        error: "No sheets found in the Excel file.",
        previewData: null,
        totalDataRows: 0,
        headersValid: false,
        dataExistsInSheet: false,
      } as WorkerParseResponse);
      return;
    }

    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[][] = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, blankrows: false, dense: true });

    if (!jsonData || jsonData.length === 0) {
      self.postMessage({
        error: "The Excel file is empty or could not be read.",
        previewData: null,
        totalDataRows: 0,
        headersValid: false,
        dataExistsInSheet: false,
      } as WorkerParseResponse);
      return;
    }

    const headersFromExcel = jsonData[0] as string[];
    let headersValid = false;
    let validationError: string | null = null;
    let dataExistsInSheet = false;
    let totalDataRows = 0;

    if (!headersFromExcel || headersFromExcel.length === 0) {
      validationError = "The Excel file is missing a header row.";
      headersValid = false;
    } else if (
      headersFromExcel.length !== customColumnHeaders.length ||
      !headersFromExcel.every((header, index) => String(header || '').trim() === customColumnHeaders[index]?.trim())
    ) {
      validationError = `Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.map(h => String(h || '').trim()).join(", ")}". Please use the provided template.`;
      headersValid = false;
    } else {
      headersValid = true;
    }

    if (headersValid) {
      // Headers are valid, now check data rows
      const actualDataRowsArray = jsonData.slice(1);
      totalDataRows = actualDataRowsArray.length;
      dataExistsInSheet = totalDataRows > 0;
      if (!dataExistsInSheet) {
        // Headers are valid, but no data rows found
        // This is not an error per se, but might be a warning or info for the user
        // For now, onValidationComplete will get hasData: false
      }
    } else {
      // Headers are invalid, so we consider no valid data to exist for processing
      dataExistsInSheet = false;
      totalDataRows = 0;
    }

    self.postMessage({
      error: validationError,
      previewData: jsonData, // Send all data for preview, even if headers are invalid for user context
      totalDataRows: totalDataRows, // This will be 0 if headers are invalid
      headersValid: headersValid,
      dataExistsInSheet: dataExistsInSheet, // This will be false if headers are invalid
    } as WorkerParseResponse);

  } catch (e: any) {
    self.postMessage({
      error: `Error parsing Excel file: ${e.message || 'Unknown error'}`,
      previewData: null,
      totalDataRows: 0,
      headersValid: false,
      dataExistsInSheet: false,
    } as WorkerParseResponse);
  }
};
