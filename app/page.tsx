'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { FileSpreadsheet, Weight, CalendarDays, RefreshCw, ArrowRight, Trash2 } from "lucide-react";

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
    <div className="min-h-screen p-8 bg-stone-100 dark:bg-stone-950">
      <main className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold mb-8 text-center text-stone-800 dark:text-stone-200">CSV File Manager</h1>
        
        <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
          {/* Upload Section */}
          <FileUpload onUploadComplete={handleUploadComplete} />

          {/* File List Section - Wrapped in Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Uploaded Files</CardTitle>
              <Button variant="ghost" size="icon" onClick={fetchFiles} title="Refresh File List">
                <RefreshCw className="h-4 w-4 text-stone-500 dark:text-stone-400" />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-6 text-stone-500 dark:text-stone-400">Loading files...</div>
              ) : error ? (
                <div className="text-red-500 py-6 text-center">Error: {error}</div>
              ) : files.length === 0 ? (
                <div className="text-stone-500 dark:text-stone-400 py-6 text-center">
                  No files uploaded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map((file) => (
                    <Card key={file.filename} className="overflow-hidden">
                      <CardContent className="p-4 flex justify-between items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" title={file.filename}>{file.filename}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400 mt-1">
                              <span className="flex items-center"><Weight className="mr-1 h-3 w-3" /> {formatFileSize(file.size)}</span>
                              <span className="flex items-center"><CalendarDays className="mr-1 h-3 w-3" /> {formatDate(file.uploadedAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500"
                            title="Delete File (Not implemented)"
                            disabled
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleFileSelect(file.filename)}
                            variant="secondary"
                          >
                            Select <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
