"use client";

import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';
import { useToast as useUiToast } from '@/hooks/use-toast';

const INITIAL_NUM_ROWS = 10;
const NUM_COLS = 6;
const MAX_HISTORY_ENTRIES = 30;

const initialGridData = (rowCount: number = INITIAL_NUM_ROWS) => Array(rowCount).fill(null).map(() => Array(NUM_COLS).fill(''));

interface CellPosition {
  r: number;
  c: number;
}

interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

interface DragState {
  isSelecting: boolean;
  startCell: CellPosition | null;
  endCell: CellPosition | null;
  pointerId: number | null;
}

const customColumnHeaders = [
  "캠페인 키",
  "캠페인 명", 
  "ADID / IDFA",
  "이름",
  "연락처",
  "비고"
];

export interface DirectEntryTabHandles {
  getGridData: () => string[][];
}

export const DirectEntryTab = forwardRef<DirectEntryTabHandles>((_props, ref) => {
  const [gridData, setGridData] = useState<string[][]>(() => initialGridData());
  const [history, setHistory] = useState<string[][][]>(() => [initialGridData().map(row => [...row])]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);
  
  const { toast } = useUiToast();

  const [dragState, setDragState] = useState<DragState>({
    isSelecting: false,
    startCell: null,
    endCell: null,
    pointerId: null,
  });

  const tableRef = useRef<HTMLTableElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Use a ref to store the latest dragState for event listeners that might capture stale state.
  const dragStateRef = useRef(dragState); 
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);


  useImperativeHandle(ref, () => ({
    getGridData: () => {
      return gridData.filter(row => row.some(cell => cell.trim() !== ''));
    }
  }));

  const pushStateToHistory = useCallback((newData: string[][]) => {
    const newHistoryRecord = newData.map(row => [...row]);
    const relevantHistory = history.slice(0, currentHistoryIndex + 1);
    
    let updatedHistory = [...relevantHistory, newHistoryRecord];
    let newIndex = relevantHistory.length;

    if (updatedHistory.length > MAX_HISTORY_ENTRIES) {
      updatedHistory = updatedHistory.slice(updatedHistory.length - MAX_HISTORY_ENTRIES);
      newIndex = MAX_HISTORY_ENTRIES - 1;
    }
    
    setHistory(updatedHistory);
    setCurrentHistoryIndex(newIndex);
  }, [history, currentHistoryIndex]);

  const handleInputChange = useCallback((
    rowIndex: number,
    colIndex: number,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    if (rowIndex >= INITIAL_NUM_ROWS || colIndex >= NUM_COLS) return;

    const newGridData = gridData.map((row, rIdx) =>
      rIdx === rowIndex
        ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell))
        : [...row]
    );
    setGridData(newGridData);
    if (JSON.stringify(newGridData) !== JSON.stringify(history[currentHistoryIndex])) {
      pushStateToHistory(newGridData);
    }
  }, [gridData, history, currentHistoryIndex, pushStateToHistory]);

  const handlePaste = useCallback((
    startRowIndex: number,
    startColIndex: number,
    event: React.ClipboardEvent<HTMLInputElement>
  ) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData('text/plain');
    const pastedRows = pastedText.split(/\r\n|\n|\r/);
    
    const newGridData = gridData.map(row => [...row]);

    pastedRows.forEach((rowString, rOffset) => {
      const targetRow = startRowIndex + rOffset;
      if (targetRow < INITIAL_NUM_ROWS) {
        const cells = rowString.split('\t');
        cells.forEach((cellValue, cOffset) => {
          const targetCol = startColIndex + cOffset;
          if (targetCol < NUM_COLS) {
            newGridData[targetRow][targetCol] = cellValue;
          }
        });
      }
    });
    setGridData(newGridData);
    pushStateToHistory(newGridData);
  }, [gridData, pushStateToHistory]);

  const getNormalizedSelection = useCallback((): SelectionRange | null => {
    const currentStartCell = dragStateRef.current.startCell;
    const currentEndCell = dragStateRef.current.endCell;

    if (!currentStartCell || !currentEndCell) return null;
    
    return {
      start: {
        r: Math.min(currentStartCell.r, currentEndCell.r),
        c: Math.min(currentStartCell.c, currentEndCell.c),
      },
      end: {
        r: Math.max(currentStartCell.r, currentEndCell.r),
        c: Math.max(currentStartCell.c, currentEndCell.c),
      },
    };
  }, []); 

  const handleCellPointerDown = useCallback((r: number, c: number, event: React.PointerEvent<HTMLElement>) => {
    // Allow focus on input and default text selection inside input
    if ((event.target as HTMLElement).tagName === 'INPUT') {
        if (dragStateRef.current.isSelecting) { 
             setDragState(prev => ({ ...prev, isSelecting: false, pointerId: null }));
        }
        return; 
    }
    
    event.preventDefault(); 
    
    const target = event.currentTarget as HTMLElement;
    try { target.setPointerCapture(event.pointerId); } catch (e) {}

    setDragState({
      isSelecting: true,
      startCell: { r, c },
      endCell: { r, c },
      pointerId: event.pointerId,
    });
  }, []);

  const handleCellPointerMove = useCallback((r: number, c: number, event: React.PointerEvent<HTMLElement>) => {
    const currentDragState = dragStateRef.current;
    
    if (currentDragState.isSelecting && currentDragState.pointerId === event.pointerId) {
      if (currentDragState.endCell?.r !== r || currentDragState.endCell?.c !== c) {
        setDragState(prev => ({
          ...prev,
          endCell: { r, c }
        }));
      }
    }
  }, []);

  const handleDocumentPointerUp = useCallback((event: PointerEvent) => {
    const currentDragState = dragStateRef.current;
    
    if (currentDragState.isSelecting && currentDragState.pointerId === event.pointerId) {
      try { (event.target as HTMLElement).releasePointerCapture(event.pointerId); } catch (e) {}

      setDragState(prev => ({
        ...prev,
        isSelecting: true, 
        pointerId: null,  
      }));
    }
  }, []); 

  useEffect(() => {
    document.addEventListener('pointerup', handleDocumentPointerUp);
    return () => {
      document.removeEventListener('pointerup', handleDocumentPointerUp);
    };
  }, [handleDocumentPointerUp]);


  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlZ = (event.ctrlKey || (isMac && event.metaKey)) && event.key.toLowerCase() === 'z' && !event.shiftKey;
      const isCtrlY = (event.ctrlKey || (isMac && event.metaKey)) && event.key.toLowerCase() === 'y';
      const isCtrlShiftZ = (event.ctrlKey || (isMac && event.metaKey)) && event.shiftKey && event.key.toLowerCase() === 'z';

      if (isCtrlZ) {
        event.preventDefault();
        if (currentHistoryIndex > 0) {
          const prevIndex = currentHistoryIndex - 1;
          setGridData(history[prevIndex].map(row => [...row]));
          setCurrentHistoryIndex(prevIndex);
        }
      } else if (isCtrlY || isCtrlShiftZ) {
        event.preventDefault();
        if (currentHistoryIndex < history.length - 1) {
          const nextIndex = currentHistoryIndex + 1;
          setGridData(history[nextIndex].map(row => [...row]));
          setCurrentHistoryIndex(nextIndex);
        }
      } else if ((event.key === 'Delete' || event.key === 'Backspace')) {
        const selection = getNormalizedSelection();
        if (selection && !isInputFocused && dragStateRef.current.isSelecting) { 
          event.preventDefault();
          let changed = false;
          const newGridData = gridData.map((row, rIdx) => {
            if (rIdx >= selection.start.r && rIdx <= selection.end.r) {
              return row.map((cell, cIdx) => {
                if (cIdx >= selection.start.c && cIdx <= selection.end.c) {
                  if (cell !== '') {
                    changed = true;
                    return '';
                  }
                }
                return cell;
              });
            }
            return [...row];
          });

          if (changed) {
            setGridData(newGridData);
            pushStateToHistory(newGridData);
          }
           setDragState({
            isSelecting: false, 
            startCell: null,
            endCell: null,
            pointerId: null,
          });
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [history, currentHistoryIndex, getNormalizedSelection, gridData, pushStateToHistory]);

  const isCellSelected = useCallback((r: number, c: number): boolean => {
    const selection = getNormalizedSelection(); 
    if (!selection || !dragState.isSelecting) return false; 
    
    return r >= selection.start.r && r <= selection.end.r &&
           c >= selection.start.c && c <= selection.end.c;
  }, [getNormalizedSelection, dragState.isSelecting]);


  const handleInitializeGrid = useCallback(() => {
    const emptyGrid = initialGridData(INITIAL_NUM_ROWS);
    const currentGridIsNotEmpty = gridData.some(row => row.some(cell => cell !== ''));

    if (currentGridIsNotEmpty || gridData.length !== INITIAL_NUM_ROWS) {
      setGridData(emptyGrid);
      pushStateToHistory(emptyGrid);
    } else if (history.length > 1 || currentHistoryIndex !== 0) { 
      setGridData(emptyGrid);
      setHistory([emptyGrid.map(row => [...row])]);
      setCurrentHistoryIndex(0);
    }
    
    setDragState({ 
      isSelecting: false,
      startCell: null,
      endCell: null,
      pointerId: null,
    });

    if (tableRef.current) {
      const firstInput = tableRef.current.querySelector<HTMLInputElement>('input[data-row="0"][data-col="0"]');
      firstInput?.focus();
    }
    toast({
      title: "초기화 완료",
      description: "필드가 성공적으로 초기화되었습니다.",
      duration: 3000,
    });
  }, [gridData, history.length, currentHistoryIndex, pushStateToHistory, toast]); 

  return (
    <div className="space-y-4 py-2 flex flex-col h-full">
      <div className="flex-shrink-0">
        <div className="flex justify-end items-center">
          <Button 
            type="button" 
            variant="outline"
            size="sm"
            onClick={handleInitializeGrid}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            필드 초기화
          </Button>
        </div>
      </div>
      
      <div className="flex-grow border rounded-md shadow-sm overflow-hidden direct-entry-grid">
        <ScrollArea className="h-full w-full">
          <div className="p-1">
            <table 
              ref={tableRef} 
              className="min-w-full divide-y divide-border text-sm direct-entry-grid"
            >
            <thead className="border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 w-10 px-1 py-2 text-center font-semibold text-muted-foreground border-r border-border">
                  #
                </th>
                {customColumnHeaders.map((header, colIndex) => (
                  <th
                    key={`header-${colIndex}`}
                    className={cn(
                      "px-2 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap",
                      colIndex === 0 && "w-24",
                      colIndex === 3 && "w-32",
                      colIndex === 4 && "w-40"
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gridData.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="direct-entry-grid">
                  <td className="sticky left-0 z-10 w-10 px-1 py-1 text-center font-medium text-muted-foreground border-r border-border sticky">
                    {rowIndex + 1}
                  </td>
                  {row.map((cell, colIndex) => (
                    <td 
                      key={`cell-${rowIndex}-${colIndex}`}
                      className={cn(
                        "p-0 relative",
                        isCellSelected(rowIndex, colIndex) && "bg-primary/30"
                      )}
                      onPointerDown={(e) => handleCellPointerDown(rowIndex, colIndex, e)}
                      onPointerMove={(e) => handleCellPointerMove(rowIndex, colIndex, e)}
                      style={{ touchAction: 'none' }}
                    >
                      <Input
                        type="text"
                        value={cell}
                        onChange={(e) => handleInputChange(rowIndex, colIndex, e)}
                        onPaste={(e) => handlePaste(rowIndex, colIndex, e)}
                        onPointerDown={(e) => {
                            e.stopPropagation(); 
                        }}
                        className={cn(
                          "w-full h-full px-2 py-1 rounded-none focus:ring-1 focus:ring-primary focus:z-30 focus:relative focus:shadow-md",
                          "border-2 border-transparent" 
                        )}
                        aria-label={`${customColumnHeaders[colIndex]}, 행 ${rowIndex + 1}`}
                        data-row={rowIndex}
                        data-col={colIndex}
                        ref={(el) => {
                          if (inputRefs.current) { 
                            inputRefs.current[`${rowIndex}-${colIndex}`] = el;
                          }
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
});

DirectEntryTab.displayName = 'DirectEntryTab';
