
"use client";

import type React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { FileUploadZone } from './FileUploadZone';
import type { UploadedFile } from '@/types/inquiry';

interface ExcelUploadTabProps {
  onFileAccepted: (file: UploadedFile) => void;
}

export function ExcelUploadTab({ onFileAccepted }: ExcelUploadTabProps) {
  const handleDownloadTemplate = () => {
    // In a real app, this would trigger a file download
    alert('Excel template download initiated (simulated).');
    // Example: window.location.href = '/path/to/template.xlsx';
  };

  return (
    <div className="space-y-6 py-2">
      <div>
        <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          Download Excel Template
        </Button>
        <p className="text-xs text-muted-foreground mt-1">
          Download the template to ensure your data is in the correct format for upload.
        </p>
      </div>
      <FileUploadZone onFileAccepted={onFileAccepted} />
    </div>
  );
}
