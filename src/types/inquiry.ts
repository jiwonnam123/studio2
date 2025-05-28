
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
  hasData: boolean; // Indicates if there are actual data rows beyond the header
  totalDataRows?: number; // Total number of data rows found (excluding header)
}

