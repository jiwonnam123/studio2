
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
    // Added dense: true for potential minor optimization
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
    // actualDataRows counts rows excluding the header row
    const actualDataRows = jsonData.length > 1 ? jsonData.length - 1 : 0;
    let headersValid = false;
    let validationError: string | null = null;

    if (!headersFromExcel || headersFromExcel.length === 0) {
      validationError = "The Excel file is missing headers.";
    } else if (
      headersFromExcel.length !== customColumnHeaders.length ||
      !headersFromExcel.every((header, index) => header?.trim() === customColumnHeaders[index]?.trim())
    ) {
      validationError = `Invalid headers. Expected: "${customColumnHeaders.join(", ")}". Found: "${headersFromExcel.join(", ")}". Please use the provided template.`;
    } else {
      headersValid = true;
    }

    const dataExistsInSheet = actualDataRows > 0;

    self.postMessage({
      error: validationError,
      previewData: jsonData, // Send all data for preview
      totalDataRows: actualDataRows,
      headersValid: headersValid,
      dataExistsInSheet: dataExistsInSheet,
    } as WorkerParseResponse);

  } catch (e: any) {
    // console.error("Error parsing Excel file in worker:", e); // Keep for debugging if necessary
    self.postMessage({
      error: `Error parsing Excel file: ${e.message || 'Unknown error'}`,
      previewData: null,
      totalDataRows: 0,
      headersValid: false,
      dataExistsInSheet: false,
    } as WorkerParseResponse);
  }
};

// export {}; // Not strictly necessary for workers imported with `new URL(...)` but good practice for module consistency
