import { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { UploadCloudIcon, UploadIcon } from 'lucide-react';

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

      // Check if the server renamed the file
      const wasRenamed = data.file?.filename !== file.name;
      
      const successMessage = wasRenamed 
        ? `File uploaded as "${data.file?.filename}" (renamed to avoid conflicts)`
        : 'File uploaded successfully with original filename!';

      setUploadStatus({ success: successMessage });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Call the onUploadComplete callback with the filename if provided
      onUploadComplete?.(data.file?.filename);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({ error: 'Failed to upload file' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Upload CSV File</CardTitle>
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

        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full"
        >
          <UploadIcon className="mr-2 h-4 w-4" />
          {uploading ? 'Uploading...' : 'Upload File'}
        </Button>
      </CardContent>
    </Card>
  );
} 