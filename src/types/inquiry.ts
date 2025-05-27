
export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string; // For image previews if needed in future
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}
