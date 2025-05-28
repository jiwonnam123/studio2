
// src/workers/excelParser.worker.ts
import * as XLSX from 'xlsx';
import type { WorkerParseRequest, WorkerParseResponse } from '@/types/inquiry';

const PREVIEW_ROWS_LIMIT = 20; // 미리보기 행 수 제한 (헤더 제외하고 데이터 행만)
const EXPECTED_COLUMNS = 6;
const customColumnHeaders = [
  "캠페인 키", "캠페인 명", "ADID / IDFA",
  "이름", "연락처", "비고"
];

self.onmessage = async (event: MessageEvent<WorkerParseRequest>) => {
  console.log("🔧 [Worker] 1. 메시지 수신됨", { timestamp: performance.now(), data: event.data });
  
  const { file } = event.data;
  const startTime = performance.now();
  const fileSize = file.size;
  const isLargeFile = fileSize > 5 * 1024 * 1024; // 5MB

  console.log("🔧 [Worker] 2. 파일 크기:", fileSize, "bytes. 대용량 파일 여부:", isLargeFile);
  if (fileSize > 1024 * 1024) { // 1MB
    console.warn("🔧 [Worker] 대용량 파일 감지 (1MB 이상):", fileSize, "bytes");
  }

  self.postMessage({ type: 'progress', stage: 'received', progress: 10, fileSize } as WorkerParseResponse);

  let response: Omit<WorkerParseResponse, 'type' | 'stage' | 'progress'> = { // type, stage, progress는 최종 응답에 필요 없음
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

  /*
  // 최후 수단: 파일 크기가 500KB를 초과하면 처리하지 않음
  if (file.size > 500 * 1024) { // 500KB
    console.warn("🔧 [Worker] 파일 크기 초과 (500KB). 처리를 중단합니다.");
    response.error = "파일이 너무 큽니다. 500KB 이하 파일을 사용해주세요.";
    response.success = false;
    response.processingTime = performance.now() - startTime;
    self.postMessage({ ...response, type: 'result' });
    return;
  }
  */

  try {
    console.log("🔧 [Worker] 3. arrayBuffer 시작", performance.now());
    self.postMessage({ type: 'progress', stage: 'reading_file_start', progress: 20, fileSize } as WorkerParseResponse);
    const arrayBuffer = await file.arrayBuffer();
    console.log("🔧 [Worker] 4. arrayBuffer 완료", performance.now());
    self.postMessage({ type: 'progress', stage: 'reading_file_done', progress: 30, fileSize } as WorkerParseResponse);

    console.log("🔧 [Worker] 5. XLSX.read 시작", performance.now());
    self.postMessage({ type: 'progress', stage: 'xlsx_read_start', progress: 40, fileSize } as WorkerParseResponse);
    
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellStyles: false,
      cellFormula: false,
      cellHTML: false,
      cellNF: false, 
      cellDates: false,
      dense: true, 
      bookVBA: false,
      // bookSheets: false, // 이 옵션 제거 또는 true로 설정해야 시트 내용 파싱 가능
      bookProps: false,
      sheetStubs: false,
      raw: true 
    });
    console.log("🔧 [Worker] 6. XLSX.read 완료", performance.now());
    self.postMessage({ type: 'progress', stage: 'xlsx_read_done', progress: 60, fileSize } as WorkerParseResponse);

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      response.error = "[Worker] No sheets found in the Excel file.";
      throw new Error(response.error);
    }
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      response.error = "[Worker] First Excel Sheet is empty or unreadable.";
      throw new Error(response.error);
    }

    console.log("🔧 [Worker] 7. sheet_to_json (데이터 추출) 시작", performance.now());
    self.postMessage({ type: 'progress', stage: 'data_extraction_start', progress: 70, fileSize } as WorkerParseResponse);
    
    const allDataWithHeader: string[][] = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '', 
      dense: true, 
    });
    console.log("🔧 [Worker] 8. sheet_to_json (데이터 추출) 완료", performance.now());
    self.postMessage({ type: 'progress', stage: 'data_extraction_done', progress: 80, fileSize } as WorkerParseResponse);

    if (!allDataWithHeader || allDataWithHeader.length === 0) {
      response.error = "[Worker] The file is empty or contains no data rows (after sheet_to_json).";
      response.previewData = [customColumnHeaders]; // 헤더만 있는 미리보기
      response.headersValid = false; // 헤더도 없다고 간주
      response.fullData = [];
      response.totalDataRows = 0;
      response.dataExistsInSheet = false;
    } else {
      const headersFromSheet = allDataWithHeader[0]?.map(header => String(header || '').trim()) || [];
      
      if (headersFromSheet.length === EXPECTED_COLUMNS &&
          customColumnHeaders.every((ch, index) => headersFromSheet[index] === ch)) {
        response.headersValid = true;
        
        const dataRowsOnly = allDataWithHeader.slice(1);
        
        response.fullData = dataRowsOnly.map(row => {
            const newRow = Array(EXPECTED_COLUMNS).fill('');
            for (let i = 0; i < EXPECTED_COLUMNS; i++) {
                if (row[i] !== undefined && row[i] !== null) {
                    newRow[i] = String(row[i]);
                }
            }
            return newRow;
        }).filter(row => row.some(cell => cell.trim() !== ''));

        response.totalDataRows = response.fullData.length;
        response.dataExistsInSheet = response.totalDataRows > 0;

        if (!response.dataExistsInSheet && response.headersValid) {
          response.error = "[Worker] Headers are valid, but no actual data rows were found beneath them.";
        }
        
        response.previewData = [customColumnHeaders, ...(response.fullData || []).slice(0, PREVIEW_ROWS_LIMIT)];
      } else {
        response.headersValid = false;
        const foundHeadersPreview = headersFromSheet.slice(0, EXPECTED_COLUMNS + 2).join(", ");
        response.error = `[Worker] Invalid headers. Expected ${EXPECTED_COLUMNS} columns: "${customColumnHeaders.join(", ")}". Found ${headersFromSheet.length} columns, starting with: "${foundHeadersPreview}". Please use the provided template.`;
        
        const originalPreviewWithPossibleWrongHeader = allDataWithHeader.slice(0, PREVIEW_ROWS_LIMIT + 1);
        response.previewData = originalPreviewWithPossibleWrongHeader.map(row => {
             const newRow = Array(Math.max(EXPECTED_COLUMNS, row.length)).fill('');
             row.forEach((cell, i) => newRow[i] = String(cell || ''));
             return newRow;
        });
        response.dataExistsInSheet = false; 
        response.fullData = null;
        response.totalDataRows = 0;
      }
    }
    
    response.success = response.headersValid && response.dataExistsInSheet && !response.error;

  } catch (e: any) {
    console.error("🔧 [Worker] 에러 발생 (파싱 중):", e);
    response.error = response.error || `[Worker] Error parsing file: ${e.message || 'Unknown error during parsing'}`;
    response.success = false;
    response.fullData = null;
    response.dataExistsInSheet = false;
    response.totalDataRows = 0;
    if (!response.previewData && file) { 
        response.previewData = [customColumnHeaders]; 
    }
  } finally {
    response.processingTime = performance.now() - startTime;
    console.log("🔧 [Worker] 9. 파싱 최종 완료 및 결과 전송 직전", { timestamp: performance.now(), response });
    self.postMessage({ ...response, type: 'result' } as WorkerParseResponse); 
  }
};
