
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const NUM_ROWS = 10;
const NUM_COLS = 6;
const MAX_HISTORY_ENTRIES = 30; // 늘어난 히스토리 크기

// Helper to generate column names like A, B, C, ... AA, AB, ...
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

export function DirectEntryTab() {
  const [gridData, setGridDataInternal] = useState<string[][]>(initialGridData);
  const [history, setHistory] = useState<string[][][]>(() => [initialGridData().map(row => [...row])]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);

  const [isFilling, setIsFilling] = useState(false);
  const [fillOriginCell, setFillOriginCell] = useState<{ r: number; c: number; val: string } | null>(null);
  const [fillTargetRange, setFillTargetRange] = useState<{ sr: number, sc: number, er: number, ec: number} | null>(null);
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
    pushStateToHistory(newGridData);
  }, [gridData, pushStateToHistory]);

  const handlePaste = useCallback((
    startRowIndex: number,
    startColIndex: number,
    event: React.ClipboardEvent<HTMLInputElement>
  ) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData('text/plain');
    const pastedRows = pastedText.split('\n');
    
    const currentActiveGridData = gridData.map(row => [...row]); // Use a fresh copy for modification

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

      if (isCtrlZ) { // Undo
        event.preventDefault();
        if (currentHistoryIndex > 0) {
          const prevIndex = currentHistoryIndex - 1;
          setGridDataInternal(history[prevIndex].map(row => [...row]));
          setCurrentHistoryIndex(prevIndex);
        }
      } else if (isCtrlY || isCtrlShiftZ) { // Redo
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


  // --- Drag to Fill Logic ---
  const handleFillHandleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>, r: number, c: number) => {
    event.preventDefault();
    event.stopPropagation(); // Prevent text selection or other input interactions
    
    setIsFilling(true);
    setFillOriginCell({ r, c, val: gridData[r][c] });
    setFillTargetRange({ sr: r, sc: c, er: r, ec: c });
    
    document.addEventListener('mouseup', handleGlobalMouseUp);
  }, [gridData]);

  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    if (!isFilling || !fillOriginCell) return;
    
    setFillTargetRange({
        sr: Math.min(fillOriginCell.r, r),
        sc: Math.min(fillOriginCell.c, c),
        er: Math.max(fillOriginCell.r, r),
        ec: Math.max(fillOriginCell.c, c),
    });
  }, [isFilling, fillOriginCell]);
  
  const handleGlobalMouseUp = useCallback(() => {
    if (!isFilling || !fillOriginCell || !fillTargetRange) {
        // Cleanup if state is inconsistent, though this should ideally not be needed often
        setIsFilling(false);
        setFillOriginCell(null);
        setFillTargetRange(null);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        return;
    }

    const { val } = fillOriginCell;
    const { sr, sc, er, ec } = fillTargetRange;

    const newGridData = gridData.map((row, rIdx) => {
        if (rIdx >= sr && rIdx <= er) {
            return row.map((cell, cIdx) => {
                if (cIdx >= sc && cIdx <= ec) {
                    return val;
                }
                return cell;
            });
        }
        return row;
    });

    setGridDataInternal(newGridData);
    pushStateToHistory(newGridData);

    setIsFilling(false);
    setFillOriginCell(null);
    setFillTargetRange(null);
    document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isFilling, fillOriginCell, fillTargetRange, gridData, pushStateToHistory]);


  const columnHeaders = Array(NUM_COLS)
    .fill(null)
    .map((_, i) => getColumnName(i));

  const handleSubmit = () => {
    console.log("Grid Data to submit:", gridData);
    alert("Direct entry data submitted (simulated). Check console for data.");
  }

  const isCellInFillRange = (r: number, c: number): boolean => {
    if (!isFilling || !fillTargetRange) return false;
    return r >= fillTargetRange.sr && r <= fillTargetRange.er &&
           c >= fillTargetRange.sc && c <= fillTargetRange.ec;
  };

  return (
    <div className="space-y-4 py-2 flex flex-col h-full">
      <p className="text-sm text-muted-foreground flex-shrink-0">
        Enter your inquiry details directly into the spreadsheet below. Use Tab or Shift+Tab to navigate.
        Copy/paste from Excel is supported (tab-separated values). Use Ctrl+Z to Undo, Ctrl+Y to Redo.
        Drag the small square at the bottom-right of a cell to fill adjacent cells.
      </p>
      <ScrollArea className="flex-grow border rounded-md shadow-sm bg-card">
        <div className="overflow-auto">
          <table ref={tableRef} className="min-w-full divide-y divide-border text-sm select-none" style={{ userSelect: isFilling ? 'none' : 'auto' }}>
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
                        className="p-0 relative"
                        onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                    >
                      <Input
                        type="text"
                        value={cell}
                        onChange={(e) => handleInputChange(rowIndex, colIndex, e)}
                        onPaste={(e) => handlePaste(rowIndex, colIndex, e)}
                        className={cn(
                            "w-full h-full px-2 py-1.5 border-0 rounded-none focus:ring-1 focus:ring-primary focus:z-30 focus:relative focus:shadow-md",
                            isCellInFillRange(rowIndex, colIndex) && "bg-primary/20 border-2 border-primary"
                        )}
                        aria-label={`Cell ${columnHeaders[colIndex]}${rowIndex + 1}`}
                      />
                      <div
                        className="absolute bottom-0 right-0 w-2 h-2 bg-primary cursor-crosshair hover:bg-primary/70 z-40"
                        onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex)}
                        title="Drag to fill cells"
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

