
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
    // Create a temporary anchor element
    const link = document.createElement('a');
    // Set the href to the path of your template file in the public folder
    link.href = '/inquiry_template.xlsx'; 
    // Set the download attribute to suggest a filename for the user
    link.setAttribute('download', 'inquiry_template.xlsx');
    // Append the link to the body (required for Firefox)
    document.body.appendChild(link);
    // Programmatically click the link to trigger the download
    link.click();
    // Clean up by removing the link
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 py-2">
      <div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Download Excel Template
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Download the template to ensure your data is in the correct format for upload.
        </p>
      </div>
      <FileUploadZone onFileAccepted={onFileAccepted} />
    </div>
  );
}
