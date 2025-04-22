import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { UploadCloudIcon, UploadIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface UploadStatus {
  success?: string;
  error?: string;
  conflictFile?: {
    name: string;
  } | null;
  debugInfo?: string;
}

interface FileUploadProps {
  onUploadComplete?: (filename: string) => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDebug, setShowDebug] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const selectedFile = files[0];
      console.log('📁 File selected:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        lastModified: new Date(selectedFile.lastModified).toISOString()
      });
      
      setFile(selectedFile);
      setUploadStatus({});

      // Preview first few bytes to check file format
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const preview = result.substring(0, 200);
        console.log('📄 File preview (first 200 chars):', preview);
        
        // Basic CSV validation
        const lines = preview.split('\n');
        if (lines.length > 0) {
          const headerLine = lines[0];
          console.log('🔍 CSV header:', headerLine);
          const commaCount = (headerLine.match(/,/g) || []).length;
          console.log(`🔢 Detected ${commaCount + 1} columns in header`);
        }
      };
      reader.readAsText(selectedFile.slice(0, 500)); // Read just first 500 bytes
    }
  };

  const handleUpload = async (confirmOverwrite: boolean = false) => {
    if (!file) return;
    
    console.log('⬆️ Starting upload process:', {
      filename: file.name,
      size: file.size,
      overwrite: confirmOverwrite
    });
    
    setUploading(true);
    setUploadStatus({});
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('overwrite', confirmOverwrite.toString());
    
    try {
      console.log(`🔄 Sending request to ${process.env.NEXT_PUBLIC_API_URL}/api/upload`);
      
      const startTime = performance.now();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const endTime = performance.now();
      
      console.log(`⏱️ Upload request completed in ${(endTime - startTime).toFixed(2)}ms with status: ${response.status}`);
      
      if (response.status === 409) {
        // Handle file conflict
        const conflictData = await response.json();
        console.log('⚠️ File conflict detected:', conflictData);
        setUploadStatus({ conflictFile: { name: conflictData.filename } });
        return;
      }
      
      if (!response.ok) {
        console.error(`❌ HTTP error! status: ${response.status}`);
        
        // Try to parse error response
        let errorText = 'Unknown server error';
        try {
          const errorData = await response.json();
          console.error('📛 Server error details:', errorData);
          errorText = errorData.message || errorData.error || errorText;
        } catch (parseErr) {
          console.error('📛 Could not parse error response:', parseErr);
          try {
            errorText = await response.text();
          } catch (textErr) {
            console.error('📛 Could not read response text:', textErr);
          }
        }
        
        throw new Error(errorText);
      }
      
      const data = await response.json();
      console.log('✅ Upload success response:', data);
      
      setUploadStatus({ 
        success: 'File uploaded successfully',
        debugInfo: `Processed: ${data.processed || 'unknown'}, File ID: ${data.fileId || 'unknown'}`
      });
      
      // Reset the file input
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      onUploadComplete?.(data.filename);
    } catch (error) {
      console.error('❌ Upload error:', error);
      let errorMessage = 'Failed to upload file';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('❌ Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      
      setUploadStatus({ 
        error: errorMessage,
        conflictFile: null,
        debugInfo: `Error at ${new Date().toISOString()}`
      });
    } finally {
      setUploading(false);
    }
  };

  const handleOverwriteConfirm = () => {
    console.log('🔄 User confirmed file overwrite');
    handleUpload(true);
  };

  const handleOverwriteCancel = () => {
    console.log('❌ User cancelled file overwrite');
    setUploadStatus({});
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Upload CSV File</CardTitle>
        <Button 
          onClick={toggleDebug} 
          variant="ghost" 
          size="sm" 
          className="h-7 px-2 text-xs"
        >
          {showDebug ? "Hide Debug" : "Show Debug"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-lg p-6 text-center hover:border-stone-400 dark:hover:border-stone-500 transition-colors">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              ref={fileInputRef}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
            >
              <div className="flex flex-col items-center">
                <UploadCloudIcon className="w-10 h-10 mb-3 text-stone-400 dark:text-stone-500" />
                <span className="text-sm">
                  {file ? file.name : 'Click to select or drag and drop CSV file'}
                </span>
                {file && (
                  <span className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            </label>
          </div>
        </div>

        {uploadStatus.error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md text-sm">
            {uploadStatus.error}
          </div>
        )}

        {uploadStatus.success && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-sm">
            {uploadStatus.success}
          </div>
        )}

        {showDebug && uploadStatus.debugInfo && (
          <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md text-sm font-mono">
            Debug info: {uploadStatus.debugInfo}
          </div>
        )}

        {file && showDebug && (
          <div className="mb-4 overflow-hidden">
            <details className="text-xs">
              <summary className="cursor-pointer p-2 bg-stone-100 dark:bg-stone-800 rounded-md">
                File Details
              </summary>
              <div className="p-2 border border-stone-200 dark:border-stone-700 mt-1 rounded-md font-mono bg-stone-50 dark:bg-stone-900 overflow-auto max-h-60">
                <pre>
                  {JSON.stringify({
                    name: file.name,
                    size: `${file.size} bytes (${(file.size / 1024).toFixed(2)} KB)`,
                    type: file.type || "text/csv",
                    lastModified: new Date(file.lastModified).toISOString()
                  }, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}

        <Button
          onClick={() => handleUpload()}
          disabled={!file || uploading || !!uploadStatus.conflictFile}
          className="w-full"
        >
          <UploadIcon className="mr-2 h-4 w-4" />
          {uploading ? 'Uploading...' : (uploadStatus.conflictFile ? 'Awaiting Confirmation' : 'Upload File')}
        </Button>

        <AlertDialog open={!!uploadStatus.conflictFile} onOpenChange={(open) => !open && handleOverwriteCancel()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>File Already Exists</AlertDialogTitle>
              <AlertDialogDescription>
                The file "{uploadStatus.conflictFile?.name}" already exists. Do you want to overwrite it?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleOverwriteCancel}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleOverwriteConfirm}>Overwrite</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
} 