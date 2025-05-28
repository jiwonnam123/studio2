
"use client";

import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';

const NUM_ROWS = 10;
const NUM_COLS = 6;
const MAX_HISTORY_ENTRIES = 30;

const initialGridData = () => Array(NUM_ROWS).fill(null).map(() => Array(NUM_COLS).fill(''));

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
  const [gridData, setGridData] = useState<string[][]>(initialGridData);
  const [history, setHistory] = useState<string[][][]>(() => [initialGridData().map(row => [...row])]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);
  
  const [dragState, setDragState] = useState<DragState>({
    isSelecting: false,
    startCell: null,
    endCell: null,
    pointerId: null,
  });

  const tableRef = useRef<HTMLTableElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dragStateRef = useRef(dragState); // To access latest dragState in event listeners

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
    
    const currentActiveGridData = gridData.map(row => [...row]);

    pastedRows.forEach((rowString, rOffset) => {
      const targetRow = startRowIndex + rOffset;
      if (targetRow < NUM_ROWS) {
        const cells = rowString.split('\t');
        cells.forEach((cellValue, cOffset) => {
          const targetCol = startColIndex + cOffset;
          if (targetCol < NUM_COLS) {
            currentActiveGridData[targetRow][targetCol] = cellValue;
          }
        });
      }
    });
    setGridData(currentActiveGridData);
    pushStateToHistory(currentActiveGridData);
  }, [gridData, pushStateToHistory]);

  const getNormalizedSelection = useCallback((): SelectionRange | null => {
    // Use dragStateRef.current for the most up-to-date values in this callback
    const currentDragState = dragStateRef.current;
    if (!currentDragState.startCell || !currentDragState.endCell) return null;
    return {
      start: {
        r: Math.min(currentDragState.startCell.r, currentDragState.endCell.r),
        c: Math.min(currentDragState.startCell.c, currentDragState.endCell.c),
      },
      end: {
        r: Math.max(currentDragState.startCell.r, currentDragState.endCell.r),
        c: Math.max(currentDragState.startCell.c, currentDragState.endCell.c),
      },
    };
  }, []); // Dependencies are stable refs or derived from them.

  const handleCellPointerDown = useCallback((r: number, c: number, event: React.PointerEvent<HTMLElement>) => {
    // Allow focus on input and default text selection inside input
    if ((event.target as HTMLElement).tagName === 'INPUT') {
        // If already selecting a range, and click inside input, stop range selection
        if (dragStateRef.current.isSelecting) {
            setDragState(prev => ({ ...prev, isSelecting: false, pointerId: null }));
        }
        return; 
    }
    
    event.preventDefault(); // Prevent text selection on td, focus changes, etc.
    
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    setDragState({
      isSelecting: true,
      startCell: { r, c },
      endCell: { r, c },
      pointerId: event.pointerId,
    });
  }, []); // No dependencies, setDragState is stable

  const handleCellPointerMove = useCallback((r: number, c: number, event: React.PointerEvent<HTMLElement>) => {
    const currentDragState = dragStateRef.current; // Use ref for latest state
    
    if (currentDragState.isSelecting && currentDragState.pointerId === event.pointerId) {
      // Check if endCell actually changed to prevent unnecessary re-renders
      if (currentDragState.endCell?.r !== r || currentDragState.endCell?.c !== c) {
        setDragState(prev => ({
          ...prev,
          endCell: { r, c }
        }));
      }
    }
  }, []); // No dependencies, setDragState is stable

  const handleDocumentPointerUp = useCallback((event: PointerEvent) => {
    const currentDragState = dragStateRef.current; // Use ref for latest state
    
    if (currentDragState.isSelecting && currentDragState.pointerId === event.pointerId) {
      // Release pointer capture from the element that set it
      // This needs to be the element that called setPointerCapture, typically tableRef.current or a specific td
      // However, event.target might be different if pointer moved outside.
      // It's safer if the element that captured the pointer releases it.
      // For simplicity here, we'll assume if we are selecting, a capture was made.
      // A more robust way would be to store the captured element in ref.
      if (tableRef.current) {
          try {
            (event.target as HTMLElement).releasePointerCapture(event.pointerId);
          } catch (e) {
            // console.warn("Failed to release pointer capture, element might have changed:", e);
          }
      }

      // Don't reset startCell/endCell here to keep selection visible
      // until next action (e.g. new click, or key press for delete)
      setDragState(prev => ({
        ...prev,
        isSelecting: true, // Keep isSelecting true to show visual selection
        pointerId: null,   // But no longer actively dragging with this pointer
      }));
    }
  }, []); // No dependencies, setDragState is stable

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
        // Check dragStateRef.current.isSelecting because dragState might be stale here
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
          // After deleting, reset selection state
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
    const selection = getNormalizedSelection(); // This uses dragStateRef.current
    // For styling, use the actual dragState for current render cycle
    if (!selection || !dragState.isSelecting) return false; 
    return r >= selection.start.r && r <= selection.end.r &&
           c >= selection.start.c && c <= selection.end.c;
  }, [getNormalizedSelection, dragState.isSelecting]);

  const handleInitializeGrid = useCallback(() => {
    const emptyGrid = initialGridData();
    const currentGridIsNotEmpty = gridData.some(row => row.some(cell => cell !== ''));

    if (currentGridIsNotEmpty) {
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
  }, [gridData, history.length, currentHistoryIndex, pushStateToHistory]);

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
            Initialize Grid
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-grow border rounded-md shadow-sm bg-card">
        <div className="overflow-auto">
          <table 
            ref={tableRef} 
            className="min-w-full divide-y divide-border text-sm select-none" // Applied select-none to table
            style={{ 
              userSelect: dragState.isSelecting ? 'none' : 'auto', // This might be overridden by className
              touchAction: 'none' // Apply touchAction to the table itself for broader pointer event handling
            }}
          >
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 w-12 px-2 py-2 text-center font-semibold text-muted-foreground bg-muted/50 border-r border-border">
                  #
                </th>
                {customColumnHeaders.map((header, colIndex) => (
                  <th
                    key={`header-${colIndex}`}
                    className="px-2 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gridData.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className={cn(rowIndex % 2 === 1 ? "bg-muted/20" : "")}>
                  <td className="sticky left-0 z-10 w-12 px-2 py-1 text-center font-medium text-muted-foreground bg-muted/50 border-r border-border">
                    {rowIndex + 1}
                  </td>
                  {row.map((cell, colIndex) => (
                    <td 
                      key={`cell-${rowIndex}-${colIndex}`} 
                      className={cn(
                        "p-0 relative cursor-default", // Added cursor-default
                        isCellSelected(rowIndex, colIndex) && "bg-primary/30"
                      )}
                      onPointerDown={(e) => handleCellPointerDown(rowIndex, colIndex, e)}
                      onPointerMove={(e) => handleCellPointerMove(rowIndex, colIndex, e)}
                      // Removed touchAction from td, applied to table
                    >
                      <Input
                        type="text"
                        value={cell}
                        onChange={(e) => handleInputChange(rowIndex, colIndex, e)}
                        onPaste={(e) => handlePaste(rowIndex, colIndex, e)}
                        className={cn(
                          "w-full h-full px-2 py-1.5 rounded-none focus:ring-1 focus:ring-primary focus:z-30 focus:relative focus:shadow-md",
                          "border-2 border-transparent pointer-events-none" // Added pointer-events-none to input
                        )}
                        aria-label={`${customColumnHeaders[colIndex]}, row ${rowIndex + 1}`}
                        data-row={rowIndex}
                        data-col={colIndex}
                        ref={(el) => {
                          if (inputRefs.current) {
                            inputRefs.current[`${rowIndex}-${colIndex}`] = el;
                          }
                        }}
                        readOnly // Make input readOnly to prevent focus/editing during drag
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
});

DirectEntryTab.displayName = 'DirectEntryTab';

