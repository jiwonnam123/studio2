
export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string; // For image previews if needed in future
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}

export interface ExcelValidationResult {
  error: string | null;
  hasData: boolean; // True if there are actual data rows beyond the header
  totalDataRows?: number; 
  previewData?: string[][] | null; // For UI preview
  fileSize?: number;
  processingTime?: number;
  isLargeFile?: boolean;
  headersValid?: boolean; // Added from worker response
}

// This type is for messages FROM the worker TO the main thread
export interface WorkerParseResponse {
  error: string | null;
  previewData: string[][] | null; // Preview data (limited rows)
  totalDataRows: number;          // Total actual data rows in the sheet (excluding header)
  headersValid: boolean;
  dataExistsInSheet: boolean;     // Based on totalDataRows > 0 AND headersValid
  fileSize: number;
  processingTime?: number;
  isLargeFile?: boolean;
}
