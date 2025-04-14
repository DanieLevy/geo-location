import { useState, useRef } from 'react';
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

interface FileUploadProps {
  onUploadComplete?: (filename: string) => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    success?: string;
    error?: string;
    conflictFile?: File | null;
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

  const handleUpload = async (confirmOverwrite: boolean = false) => {
    const fileToUpload = uploadStatus.conflictFile || file;
    
    if (!fileToUpload) {
      setUploadStatus({ error: 'Please select a file first' });
      return;
    }

    const formData = new FormData();
    formData.append('file', fileToUpload);
    if (confirmOverwrite) {
      formData.append('overwrite', 'true');
    }

    try {
      setUploading(true);
      setUploadStatus(prev => ({ conflictFile: prev.conflictFile }));

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.status === 409) {
        console.log('Conflict detected:', data.filename);
        setUploadStatus({ conflictFile: fileToUpload });
        setUploading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      const successMessage = data.message || 'File uploaded successfully!';

      setUploadStatus({ success: successMessage, conflictFile: null });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      onUploadComplete?.(data.filename);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({ error: 'Failed to upload file', conflictFile: null });
    } finally {
      if (response?.status !== 409) {
         setUploading(false);
      }
    }
  };

  const handleOverwriteConfirm = () => {
    handleUpload(true);
  };

  const handleOverwriteCancel = () => {
    setUploadStatus({});
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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