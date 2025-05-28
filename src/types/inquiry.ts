
export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}

// 워커가 메인 스레드로 보내는 메시지 구조
export interface WorkerParseResponse {
  success: boolean; // 전체적인 처리 성공 여부 (헤더 유효, 데이터 처리 시도 등)
  error: string | null;
  previewData: string[][] | null; // UI 미리보기용 데이터 (제한된 행)
  totalDataRows: number; // 헤더를 제외한 실제 데이터 행 수
  headersValid: boolean;
  dataExistsInSheet: boolean; // 실제 데이터 행이 존재하는지 여부
  fileSize: number;
  processingTime?: number;
  isLargeFile?: boolean;
}

// InquiryModal에서 관리하는 Excel 유효성 검사 결과 상태
export interface ExcelValidationResult {
  error: string | null;
  hasData: boolean; // WorkerParseResponse의 dataExistsInSheet에 해당
  isValid: boolean; // WorkerParseResponse의 success에 해당
  totalDataRows?: number;
  previewData?: string[][] | null;
  fileSize?: number;
  processingTime?: number;
  isLargeFile?: boolean;
  headersValid?: boolean;
}
