
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Trash2, RotateCcw } from 'lucide-react';

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
        : row
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
    const pastedRows = pastedText.split(/\\r\\n|\\n|\\r/); // Handles different line endings
    
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlZ = (event.ctrlKey || (isMac && event.metaKey)) && event.key.toLowerCase() === 'z' && !event.shiftKey;
      const isCtrlY = (event.ctrlKey || (isMac && event.metaKey)) && event.key.toLowerCase() === 'y';
      const isCtrlShiftZ = (event.ctrlKey || (isMac && event.metaKey)) && event.shiftKey && event.key.toLowerCase() === 'z';

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        if(tableRef.current && tableRef.current.contains(event.target as Node)) {
           // Grid input, proceed
        } else {
            return; // Not our input, let browser handle
        }
      }

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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [history, currentHistoryIndex]);

  const handleCellMouseDown = useCallback((r: number, c: number) => {
    setIsSelecting(true);
    setSelectionStartCell({ r, c });
    setSelectionEndCell({ r, c }); // Start selection with a single cell
    document.addEventListener('mouseup', handleDocumentMouseUp, { once: true });
  }, [handleDocumentMouseUp]);
  
  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    if (isSelecting) {
      setSelectionEndCell({ r, c });
    }
  }, [isSelecting]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDocumentMouseUp = useCallback(() => {
    setIsSelecting(false);
    // No need to remove listener if { once: true } is used
  }, []);

  const getNormalizedSelection = (): SelectionRange | null => {
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
  };

  const isCellSelected = (r: number, c: number): boolean => {
    const selection = getNormalizedSelection();
    if (!selection) return false;
    return r >= selection.start.r && r <= selection.end.r &&
           c >= selection.start.c && c <= selection.end.c;
  };

  const handleClearSelected = () => {
    const selection = getNormalizedSelection();
    if (!selection) return;

    const newGridData = gridData.map((row, rIdx) => {
      if (rIdx >= selection.start.r && rIdx <= selection.end.r) {
        return row.map((cell, cIdx) => {
          if (cIdx >= selection.start.c && cIdx <= selection.end.c) {
            return '';
          }
          return cell;
        });
      }
      return [...row]; // Return a new array for unchanged rows too
    });
    setGridDataInternal(newGridData);
    pushStateToHistory(newGridData);
    setSelectionStartCell(null);
    setSelectionEndCell(null);
  };
  
  const handleInitializeGrid = () => {
    const emptyGrid = initialGridData();
    setGridDataInternal(emptyGrid);
    setHistory([emptyGrid.map(row => [...row])]); 
    setCurrentHistoryIndex(0);
    setSelectionStartCell(null);
    setSelectionEndCell(null);
  };

  const columnHeaders = Array(NUM_COLS).fill(null).map((_, i) => getColumnName(i));

  const handleSubmit = () => {
    console.log("Grid Data to submit:", gridData);
    alert("Direct entry data submitted (simulated). Check console for data.");
  }

  return (
    <div className="space-y-4 py-2 flex flex-col h-full">
      <div className="flex-shrink-0 space-y-2">
        <p className="text-sm text-muted-foreground">
          Enter your inquiry details directly into the spreadsheet below. Use Tab or Shift+Tab to navigate.
          Copy/paste from Excel is supported. Use Ctrl+Z to Undo, Ctrl+Y to Redo.
          Click and drag to select a range of cells.
        </p>
        <div className="flex gap-2">
          <Button 
            type="button" 
            variant="outline"
            size="sm"
            onClick={handleClearSelected}
            disabled={!selectionStartCell}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Selected
          </Button>
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
            className="min-w-full divide-y divide-border text-sm"
            style={{ userSelect: isSelecting ? 'none' : 'auto' }}
            onMouseLeave={() => { if (isSelecting) handleDocumentMouseUp(); }}
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
                          "p-0 relative", // Ensure no padding on td for input to fill
                          isCellSelected(rowIndex, colIndex) && "bg-primary/10" // Apply background to td
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
                            "border-2", // Always have a 2px border
                            isCellSelected(rowIndex, colIndex) ? "border-primary" : "border-transparent" // Change border color
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
      <div className="flex-shrink-0 pt-2">
        <Button type="button" className="w-full sm:w-auto" onClick={handleSubmit} disabled>
          Submit Grid Data (WIP)
        </Button>
      </div>
    </div>
  );
}

    