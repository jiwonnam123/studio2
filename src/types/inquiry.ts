
export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'idle' | 'success' | 'error';
  errorMessage?: string;
}

// Message structure from Worker to Main Thread
export interface WorkerParseRequest { // Added for clarity, assuming worker receives this
  file: File;
}

export interface WorkerParseResponse {
  type?: 'progress' | 'result'; // Added for progress reporting
  stage?: string;               // Added for progress reporting
  progress?: number;            // Added for progress reporting
  success: boolean;
  error: string | null;
  previewData: string[][] | null;
  fullData: string[][] | null;      // For submission: all data rows (6 columns, no headers)
  totalDataRows: number;            // Total number of data rows found (excluding header)
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
  headersValid?: boolean;
  // Performance related
  fileSize?: number;
  processingTime?: number;
  isLargeFile?: boolean;
}
