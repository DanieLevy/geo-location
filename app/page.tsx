'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";

interface UploadedFile {
  filename: string;
  uploadedAt: string;
  size: number;
}

export default function Home() {
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/files`);
      const data = await response.json();
      setFiles(data.files);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError('Failed to fetch file list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleFileSelect = (filename: string) => {
    router.push(`/process?file=${encodeURIComponent(filename)}`);
  };

  const handleUploadComplete = (filename: string) => {
    fetchFiles();
    // Automatically navigate to process page with the newly uploaded file
    router.push(`/process?file=${encodeURIComponent(filename)}`);
  };

  return (
    <div className="min-h-screen p-8 bg-stone-50 dark:bg-stone-900">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">CSV File Manager</h1>
        
        <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
          {/* Upload Section */}
          <div>
            <FileUpload onUploadComplete={handleUploadComplete} />
          </div>

          {/* File List Section */}
          <div className="bg-white dark:bg-stone-800 p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Uploaded Files</h2>
            
            {loading ? (
              <div className="text-center py-4">Loading...</div>
            ) : error ? (
              <div className="text-red-500 py-4">{error}</div>
            ) : files.length === 0 ? (
              <div className="text-stone-500 dark:text-stone-400 py-4">
                No files uploaded yet
              </div>
            ) : (
              <div className="space-y-4">
                {files.map((file) => (
                  <div
                    key={file.filename}
                    className="p-4 bg-stone-50 dark:bg-stone-700 rounded-lg"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="font-medium mb-1">{file.filename}</div>
                        <div className="text-sm text-stone-500 dark:text-stone-400">
                          <div>Size: {formatFileSize(file.size)}</div>
                          <div>Uploaded: {formatDate(file.uploadedAt)}</div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleFileSelect(file.filename)}
                        variant="secondary"
                        className="shrink-0"
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
