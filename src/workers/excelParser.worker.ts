// src/workers/excelParser.worker.ts
import * as XLSX from 'xlsx';
import type { WorkerParseRequest, WorkerParseResponse } from '@/types/inquiry';

const PREVIEW_ROWS_LIMIT = 20; // 미리보기 행 수 제한 (헤더 제외하고 데이터 행만)
const EXPECTED_COLUMNS = 6;
const customColumnHeaders = [
  "캠페인 키", "캠페인 명", "ADID / IDFA",
  "이름", "연락처", "비고"
];

// 500KB 초과 파일 처리 중단 로직 (필요시 주석 해제)
/*
const MAX_FILE_SIZE_FOR_PROCESSING = 500 * 1024; // 500KB
*/

self.onmessage = async (event: MessageEvent<WorkerParseRequest>) => {
  console.log("🔧 [Worker] 1. 메시지 수신됨", { timestamp: performance.now(), dataReceived: event.data });
  
  const { file } = event.data;
  const startTime = performance.now();
  const fileSize = file.size;
  const isLargeFile = fileSize > 5 * 1024 * 1024; // 5MB
  
  console.log("🔧 [Worker] 2. 파일 정보:", { name: file.name, size: fileSize, type: file.type, isLargeFile });

  // 파일 크기 제한 로직 (필요시 활성화)
  /*
  if (fileSize > MAX_FILE_SIZE_FOR_PROCESSING) {
    console.warn(`🔧 [Worker] 파일 크기 초과 (${(fileSize / 1024).toFixed(1)}KB > ${(MAX_FILE_SIZE_FOR_PROCESSING / 1024).toFixed(1)}KB). 처리 중단.`);
    const processingTime = performance.now() - startTime;
    self.postMessage({
      type: 'result',
      success: false,
      error: `파일이 너무 큽니다. ${(MAX_FILE_SIZE_FOR_PROCESSING / 1024).toFixed(0)}KB 이하 파일을 사용해주세요.`,
      previewData: null,
      fullData: null,
      totalDataRows: 0,
      headersValid: false,
      dataExistsInSheet: false,
      fileSize,
      processingTime,
      isLargeFile: fileSize > MAX_FILE_SIZE_FOR_PROCESSING, // isLargeFile 플래그는 파일 크기에 따라 설정
    } as WorkerParseResponse);
    return;
  }
  */

  if (fileSize > 1 * 1024 * 1024) { // 1MB 이상 시 경고
    console.warn("🔧 [Worker] 대용량 파일 감지 (1MB 이상):", fileSize, "bytes");
  }

  self.postMessage({ type: 'progress', stage: 'received', progress: 10, fileSize } as WorkerParseResponse);

  let response: Omit<WorkerParseResponse, 'type' | 'stage' | 'progress' | 'file' | 'fileObject'> = {
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

  try {
    console.log("🔧 [Worker] 3. arrayBuffer 변환 시작", performance.now());
    self.postMessage({ type: 'progress', stage: 'reading_file_start', progress: 20, fileSize } as WorkerParseResponse);
    const arrayBuffer = await file.arrayBuffer();
    console.log("🔧 [Worker] 4. arrayBuffer 변환 완료", performance.now());
    self.postMessage({ type: 'progress', stage: 'reading_file_done', progress: 30, fileSize } as WorkerParseResponse);

    let workbook;
    try {
      console.log("🔧 [Worker] 5. XLSX.read 시작", performance.now());
      self.postMessage({ type: 'progress', stage: 'xlsx_read_start', progress: 40, fileSize } as WorkerParseResponse);
      workbook = XLSX.read(arrayBuffer, { 
        type: 'array',
        cellStyles: false,
        cellFormula: false,
        cellHTML: false,
        cellNF: false, 
        cellDates: false,
        dense: true, 
        bookVBA: false,
        bookProps: false,
        sheetStubs: false,
        raw: true
      });
      console.log("🔧 [Worker] 6. XLSX.read 완료", performance.now());
      self.postMessage({ type: 'progress', stage: 'xlsx_read_done', progress: 60, fileSize } as WorkerParseResponse);
    } catch (xlsxError: any) {
      console.error("🔧 [Worker] XLSX.read 중 심각한 오류 발생:", xlsxError);
      response.error = `[Worker] XLSX.read Error: ${xlsxError.message || 'Unknown XLSX library error'}${xlsxError.stack ? '\nStack: ' + xlsxError.stack : ''}`;
      throw xlsxError; // Re-throw to be caught by the outer catch
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      response.error = "[Worker] No sheets found in the Excel/CSV file.";
      throw new Error(response.error);
    }
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      response.error = "[Worker] First sheet is empty or unreadable.";
      throw new Error(response.error);
    }
    console.log("🔧 [Worker] 6.5. 첫 번째 시트 가져오기 완료", { firstSheetName, worksheetExists: !!worksheet }, performance.now());

    console.log("🔧 [Worker] 7. sheet_to_json (전체 데이터 추출) 시작", performance.now());
    self.postMessage({ type: 'progress', stage: 'data_extraction_start', progress: 70, fileSize } as WorkerParseResponse);
    
    // 전체 데이터를 먼저 추출하여 헤더 검증 및 fullData 생성
    const allDataRaw: string[][] = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      blankrows: false, // 빈 행은 제외
      defval: '', // 빈 셀은 빈 문자열로
      raw: true, // 원시 값으로 가져옴
    });
    console.log("🔧 [Worker] 8. sheet_to_json (전체 데이터 추출) 완료", { rawRowCount: allDataRaw.length }, performance.now());
    self.postMessage({ type: 'progress', stage: 'data_extraction_done', progress: 80, fileSize } as WorkerParseResponse);

    if (!allDataRaw || allDataRaw.length === 0) {
      response.error = "[Worker] The file is empty or contains no data rows (after sheet_to_json).";
      response.previewData = [customColumnHeaders.map(h => String(h))]; // 헤더만 있는 미리보기
      response.headersValid = false;
      response.fullData = [];
      response.totalDataRows = 0;
      response.dataExistsInSheet = false;
    } else {
      const headersFromSheet = allDataRaw[0]?.map(header => String(header || '').trim()) || [];
      console.log("🔧 [Worker] 8.1. 추출된 헤더:", headersFromSheet);
      
      if (headersFromSheet.length === EXPECTED_COLUMNS &&
          customColumnHeaders.every((ch, index) => headersFromSheet[index] === ch)) {
        response.headersValid = true;
        console.log("🔧 [Worker] 8.2. 헤더 유효함.");
        
        const dataRowsOnly = allDataRaw.slice(1);
        
        // fullData: 헤더를 제외한 모든 행에서 6열만 추출
        response.fullData = dataRowsOnly.map(row => {
            const newRow = Array(EXPECTED_COLUMNS).fill('');
            for (let i = 0; i < EXPECTED_COLUMNS; i++) {
                if (row[i] !== undefined && row[i] !== null) {
                    newRow[i] = String(row[i]);
                }
            }
            return newRow;
        }).filter(row => row.some(cell => cell.trim() !== '')); // 실제 내용이 있는 행만 카운트

        response.totalDataRows = response.fullData.length;
        response.dataExistsInSheet = response.totalDataRows > 0;
        console.log("🔧 [Worker] 8.3. fullData 생성 완료.", { totalDataRows: response.totalDataRows, dataExists: response.dataExistsInSheet });

        if (!response.dataExistsInSheet && response.headersValid) {
          response.error = "[Worker] Headers are valid, but no actual data rows were found beneath them.";
        }
        
        // previewData: 헤더와 fullData의 처음 PREVIEW_ROWS_LIMIT 개 행
        response.previewData = [customColumnHeaders.map(h => String(h)), ...(response.fullData || []).slice(0, PREVIEW_ROWS_LIMIT)];
        console.log("🔧 [Worker] 8.4. previewData 생성 완료.", { previewDataLength: response.previewData.length });

      } else {
        response.headersValid = false;
        const foundHeadersPreview = headersFromSheet.slice(0, EXPECTED_COLUMNS + 2).join(", ");
        response.error = `[Worker] Invalid headers. Expected ${EXPECTED_COLUMNS} columns: "${customColumnHeaders.join(", ")}". Found ${headersFromSheet.length} columns, starting with: "${foundHeadersPreview}". Please use the provided template.`;
        console.warn("🔧 [Worker] 8.2. 헤더 유효하지 않음:", response.error);
        
        // 헤더가 잘못되었어도 원본 미리보기는 제공
        const originalPreviewWithPossibleWrongHeader = allDataRaw.slice(0, PREVIEW_ROWS_LIMIT + 1);
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
    console.log("🔧 [Worker] 8.5. 최종 유효성 결과:", { success: response.success, error: response.error, headersValid: response.headersValid, dataExists: response.dataExistsInSheet });

  } catch (e: any) {
    console.error("🔧 [Worker] 에러 발생 (파싱 중):", e);
    // If response.error was already set by a more specific catch (like XLSX.read), don't overwrite it unless e has more info
    if (!response.error || (e.message && response.error && !response.error.includes(e.message))) {
       response.error = `[Worker] Error parsing file: ${e.message || 'Unknown error during parsing'}${e.stack ? '\nStack: ' + e.stack : ''}`;
    }
    console.error("🔧 [Worker] 최종 오류 정보 객체:", e); // Log the full error object
    response.success = false;
    response.fullData = null;
    response.dataExistsInSheet = false;
    response.totalDataRows = 0;
    if (!response.previewData && file) { 
        response.previewData = [customColumnHeaders.map(h => String(h))]; 
    }
  } finally {
    response.processingTime = performance.now() - startTime;
    console.log("🔧 [Worker] 9. 파싱 최종 완료 및 결과 전송 직전", { timestamp: performance.now(), response });
    self.postMessage({ ...response, type: 'result' } as WorkerParseResponse); 
  }
};
