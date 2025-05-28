
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';

const NUM_ROWS = 10;
const NUM_COLS = 6;
const MAX_HISTORY_ENTRIES = 30;

const getColumnName = (colIndex: number): string => {
  let name = '';
  let n = colIndex;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
};

const initialGridData = () => Array(NUM_ROWS).fill(null).map(() => Array(NUM_COLS).fill(''));

interface CellPosition {
  r: number;
  c: number;
}

interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

export function DirectEntryTab() {
  const [gridData, setGridDataInternal] = useState<string[][]>(initialGridData);
  const [history, setHistory] = useState<string[][][]>(() => [initialGridData().map(row => [...row])]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStartCell, setSelectionStartCell] = useState<CellPosition | null>(null);
  const [selectionEndCell, setSelectionEndCell] = useState<CellPosition | null>(null);
  
  const tableRef = useRef<HTMLTableElement>(null);

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
    setGridDataInternal(newGridData);
    if (JSON.stringify(newGridData) !== JSON.stringify(history[currentHistoryIndex])) {
        pushStateToHistory(newGridData);
    }
  }, [gridData, pushStateToHistory, history, currentHistoryIndex]);

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
    setGridDataInternal(currentActiveGridData);
    pushStateToHistory(currentActiveGridData);
  }, [gridData, pushStateToHistory]);

  const getNormalizedSelection = useCallback((): SelectionRange | null => {
    if (!selectionStartCell || !selectionEndCell) return null;
    return {
      start: {
        r: Math.min(selectionStartCell.r, selectionEndCell.r),
        c: Math.min(selectionStartCell.c, selectionEndCell.c),
      },
      end: {
        r: Math.max(selectionStartCell.r, selectionEndCell.r),
        c: Math.max(selectionStartCell.c, selectionEndCell.c),
      },
    };
  }, [selectionStartCell, selectionEndCell]);

  const handleDocumentMouseUp = useCallback(() => {
    if (isSelecting) {
        setIsSelecting(false);
    }
  }, [isSelecting]);
  
  useEffect(() => {
    document.addEventListener('mouseup', handleDocumentMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [handleDocumentMouseUp]);


  const handleCellMouseDown = useCallback((r: number, c: number) => {
    setIsSelecting(true);
    setSelectionStartCell({ r, c });
    setSelectionEndCell({ r, c }); 
  }, []);
  
  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    if (isSelecting) {
      setSelectionEndCell({ r, c });
    }
  }, [isSelecting]);

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
          setGridDataInternal(history[prevIndex].map(row => [...row]));
          setCurrentHistoryIndex(prevIndex);
        }
      } else if (isCtrlY || isCtrlShiftZ) {
        event.preventDefault();
        if (currentHistoryIndex < history.length - 1) {
          const nextIndex = currentHistoryIndex + 1;
          setGridDataInternal(history[nextIndex].map(row => [...row]));
          setCurrentHistoryIndex(nextIndex);
        }
      } else if ((event.key === 'Delete' || event.key === 'Backspace')) {
        const selection = getNormalizedSelection();
        if (selection && !isInputFocused) { 
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
                setGridDataInternal(newGridData);
                pushStateToHistory(newGridData);
            }
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [history, currentHistoryIndex, getNormalizedSelection, gridData, pushStateToHistory]);



  const isCellSelected = (r: number, c: number): boolean => {
    const selection = getNormalizedSelection();
    if (!selection) return false;
    return r >= selection.start.r && r <= selection.end.r &&
           c >= selection.start.c && c <= selection.end.c;
  };
  
  const handleInitializeGrid = useCallback(() => {
    const emptyGrid = initialGridData();
    if(JSON.stringify(gridData) !== JSON.stringify(emptyGrid)) {
        setGridDataInternal(emptyGrid);
        pushStateToHistory(emptyGrid); 
    } else if (history.length > 1 || currentHistoryIndex !== 0) {
        setHistory([emptyGrid.map(row => [...row])]); 
        setCurrentHistoryIndex(0);
    }
    setSelectionStartCell(null);
    setSelectionEndCell(null);
  }, [gridData, history.length, currentHistoryIndex, pushStateToHistory]);

  const columnHeaders = Array(NUM_COLS).fill(null).map((_, i) => getColumnName(i));

  return (
    <div className="space-y-4 py-2 flex flex-col h-full">
      <div className="flex-shrink-0 space-y-2">
        <div className="flex justify-end items-center"> {/* Modified to justify-end */}
            {/* The descriptive text <p> tag has been removed */}
            <Button 
                type="button" 
                variant="outline"
                size="sm"
                onClick={handleInitializeGrid}
                className="ml-4" 
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
            className="min-w-full divide-y divide-border text-sm"
            style={{ userSelect: isSelecting ? 'none' : 'auto' }} 
            onMouseLeave={() => {
                // Optional: if you want to stop selection when mouse leaves the table
                // if (isSelecting) setIsSelecting(false); 
            }}
          >
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 w-12 px-2 py-2 text-center font-semibold text-muted-foreground bg-muted/50 border-r border-border">#</th>
                {columnHeaders.map((header) => (
                  <th
                    key={`header-${header}`}
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
                          "p-0 relative", 
                           isCellSelected(rowIndex, colIndex) && "bg-primary/20" 
                        )}
                        onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                        onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                    >
                      <Input
                        type="text"
                        value={cell}
                        onChange={(e) => handleInputChange(rowIndex, colIndex, e)}
                        onPaste={(e) => handlePaste(rowIndex, colIndex, e)}
                        className={cn(
                            "w-full h-full px-2 py-1.5 rounded-none focus:ring-1 focus:ring-primary focus:z-30 focus:relative focus:shadow-md",
                            "border-2", 
                            isCellSelected(rowIndex, colIndex) ? "border-primary" : "border-transparent"
                        )}
                        aria-label={`Cell ${columnHeaders[colIndex]}${rowIndex + 1}`}
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
}
