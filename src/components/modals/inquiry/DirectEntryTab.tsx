
"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const NUM_ROWS = 10;
const NUM_COLS = 6;

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

export function DirectEntryTab() {
  const [gridData, setGridData] = useState<string[][]>(
    Array(NUM_ROWS)
      .fill(null)
      .map(() => Array(NUM_COLS).fill(''))
  );

  const handleInputChange = (
    rowIndex: number,
    colIndex: number,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newData = gridData.map((row, rIdx) =>
      rIdx === rowIndex
        ? row.map((cell, cIdx) => (cIdx === colIndex ? event.target.value : cell))
        : row
    );
    setGridData(newData);
  };

  const columnHeaders = Array(NUM_COLS)
    .fill(null)
    .map((_, i) => getColumnName(i));

  // TODO: Implement actual submission logic
  const handleSubmit = () => {
    console.log("Grid Data to submit:", gridData);
    alert("Direct entry data submitted (simulated). Check console for data.");
  }

  return (
    <div className="space-y-4 py-2 flex flex-col h-full">
      <p className="text-sm text-muted-foreground flex-shrink-0">
        Enter your inquiry details directly into the spreadsheet below.
        Use Tab or Shift+Tab to navigate between cells.
      </p>
      <ScrollArea className="flex-grow border rounded-md shadow-sm bg-card">
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 w-12 px-2 py-2 text-center font-semibold text-muted-foreground bg-muted/50 border-r border-border">#</th>
                {columnHeaders.map((header, colIndex) => (
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
                    <td key={`cell-${rowIndex}-${colIndex}`} className="p-0">
                      <Input
                        type="text"
                        value={cell}
                        onChange={(e) => handleInputChange(rowIndex, colIndex, e)}
                        className="w-full h-full px-2 py-1.5 border-0 rounded-none focus:ring-1 focus:ring-primary focus:z-30 focus:relative focus:shadow-md"
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
