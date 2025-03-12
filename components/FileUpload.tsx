import { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onUploadComplete?: (filename: string) => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    success?: string;
    error?: string;
  }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.name.toLowerCase().endsWith('.csv')) {
      setFile(selectedFile);
      setUploadStatus({});
    } else {
      setUploadStatus({ error: 'Please select a CSV file' });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus({ error: 'Please select a file first' });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      setUploadStatus({});

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadStatus({ success: 'File uploaded successfully!' });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Call the onUploadComplete callback with the filename if provided
      onUploadComplete?.(data.filename);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({ error: 'Failed to upload file' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-md dark:bg-stone-800 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Upload CSV File</h2>
        <div className="border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-lg p-6 text-center">
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
              <svg
                className="w-8 h-8 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="text-sm">
                {file ? file.name : 'Click to select or drag and drop CSV file'}
              </span>
            </div>
          </label>
        </div>
      </div>

      {uploadStatus.error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {uploadStatus.error}
        </div>
      )}

      {uploadStatus.success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
          {uploadStatus.success}
        </div>
      )}

      <Button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full"
      >
        {uploading ? 'Uploading...' : 'Upload File'}
      </Button>
    </div>
  );
} 