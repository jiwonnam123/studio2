
export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}

// Message structure from Worker to Main Thread
export interface WorkerParseResponse {
  success: boolean; // Overall success (headers valid, data exists, no critical errors)
  error: string | null;
  previewData: string[][] | null;   // For UI: headers + limited data rows (first N rows, 6 columns)
  fullData: string[][] | null;      // For submission: all data rows (6 columns, no headers)
  totalDataRows: number;            // Total number of data rows found (excluding header, from fullData)
  headersValid: boolean;
  dataExistsInSheet: boolean;       // Based on totalDataRows > 0
  fileSize: number;
  processingTime?: number;
  isLargeFile?: boolean;
}

// State managed by InquiryModal for Excel validation results
export interface ExcelValidationResult {
  isValid: boolean; // Corresponds to WorkerParseResponse.success
  error: string | null;
  hasData: boolean; // Corresponds to WorkerParseResponse.dataExistsInSheet
  previewData?: string[][] | null;
  fullData?: string[][] | null;
  totalDataRows?: number;
  fileSize?: number;
  processingTime?: number;
  isLargeFile?: boolean;
  headersValid?: boolean;
}
