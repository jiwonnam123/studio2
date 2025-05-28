
export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'idle' | 'success' | 'error'; // 'uploading' is handled by FileUploadZone internal state
  errorMessage?: string;
}

export interface WorkerParseRequest {
  file: File;
}

export interface WorkerParseResponse {
  type?: 'progress' | 'result';
  stage?: string;
  progress?: number;
  success: boolean; // Overall success of parsing and validation
  error: string | null;
  previewData: string[][] | null; // Headers + limited data rows for UI preview
  fullData: string[][] | null;    // All 6-column data rows, excluding headers, for submission
  totalDataRows: number; // Total number of data rows found (excluding header)
  headersValid: boolean;
  dataExistsInSheet: boolean; // Based on totalDataRows > 0
  fileSize: number;
  processingTime?: number;
  isLargeFile?: boolean;
}

export interface ExcelValidationResult {
  isValid: boolean; // Corresponds to WorkerParseResponse.success (overall validity)
  error: string | null;
  hasData: boolean; // Corresponds to WorkerParseResponse.dataExistsInSheet
  previewData?: string[][] | null; // For UI preview table
  fullData?: string[][] | null;    // For actual submission to DB (all 6-column data)
  totalDataRows?: number;
  headersValid?: boolean;
  // Performance related
  fileSize?: number;
  processingTime?: number;
  isLargeFile?: boolean;
}
