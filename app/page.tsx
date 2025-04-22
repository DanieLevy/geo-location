'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileSpreadsheet, Weight, CalendarDays, RefreshCw, ArrowRight, Trash2, Loader2, BrainCircuit, Bug } from "lucide-react";
import { getAiChatCompletion } from "@/lib/aiService";
import { CsvDebugger } from "@/components/CsvDebugger";

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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showDebugger, setShowDebugger] = useState(false);

  // --- AI State --- 
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      setSelectedFiles(new Set());
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

  const handleCheckboxChange = (filename: string, checked: boolean) => {
    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      if (checked) {
        newSelection.add(filename);
      } else {
        newSelection.delete(filename);
      }
      return newSelection;
    });
  };

  const handleProcessSelected = () => {
    if (selectedFiles.size === 0) return;
    const filenames = Array.from(selectedFiles);
    router.push(`/process?files=${encodeURIComponent(filenames.join(','))}`);
  };

  const handleUploadComplete = (filename: string) => {
    fetchFiles();
  };

  const toggleDebugger = () => {
    setShowDebugger(!showDebugger);
  };

  // --- AI Submit Handler --- 
  const handleAiSubmit = async () => {
    if (!aiQuery.trim()) return;

    setAiLoading(true);
    setAiResponse("");
    setAiError(null);

    try {
      const payload = {
        messages: [
          { role: "system" as const, content: "You are a helpful assistant." }, // Example system prompt
          { role: "user" as const, content: aiQuery },
        ],
        // Optional: Specify model if needed, otherwise backend default is used
        // model: "your-lm-studio-model-id"
      };
      const result = await getAiChatCompletion(payload);
      setAiResponse(result.response);
    } catch (err: any) {
      console.error("AI Query Error:", err);
      setAiError(err.message || "Failed to get response from AI");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-stone-100 dark:bg-stone-950">
      <main className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h1 className="text-4xl font-bold text-stone-800 dark:text-stone-200">CSV File Manager</h1>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleDebugger}
            className="flex items-center gap-2"
          >
            <Bug className="h-4 w-4" />
            {showDebugger ? 'Hide CSV Debugger' : 'CSV Format Debugger'}
          </Button>
        </div>
        
        {showDebugger && (
          <div className="mb-8">
            <CsvDebugger onClose={toggleDebugger} />
          </div>
        )}
        
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
                <div className="text-center py-6 text-stone-500 dark:text-stone-400 flex items-center justify-center">
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading files...
                 </div>
              ) : error ? (
                <div className="text-red-500 py-6 text-center">Error: {error}</div>
              ) : files.length === 0 ? (
                <div className="text-stone-500 dark:text-stone-400 py-6 text-center">
                  No files uploaded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map((file) => (
                    <Card key={file.filename} className={`overflow-hidden transition-colors ${selectedFiles.has(file.filename) ? 'bg-stone-100 dark:bg-stone-700/50' : ''}`}>
                      <CardContent className="p-4 flex justify-between items-center gap-4">
                        <Checkbox 
                          id={`select-${file.filename}`}
                          checked={selectedFiles.has(file.filename)}
                          onCheckedChange={(checked) => handleCheckboxChange(file.filename, !!checked)}
                          className="mr-2"
                        />
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
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
            {files.length > 0 && !loading && !error && (
              <CardFooter className="pt-4 border-t">
                 <Button 
                    onClick={handleProcessSelected}
                    disabled={selectedFiles.size === 0}
                    className="w-full"
                  >
                     Process {selectedFiles.size} Selected File(s)
                  </Button>
               </CardFooter>
             )}
          </Card>
        </div>

        {/* --- AI Interaction Section --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BrainCircuit className="mr-2 h-5 w-5 text-purple-600 dark:text-purple-400" /> Ask AI
            </CardTitle>
            <CardDescription>Enter a query to get insights from the AI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full gap-1.5">
              <Label htmlFor="ai-query">Your Query</Label>
              <Textarea 
                placeholder="Type your message here..." 
                id="ai-query" 
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                rows={3}
                disabled={aiLoading}
              />
            </div>
            <Button onClick={handleAiSubmit} disabled={aiLoading || !aiQuery.trim()} className="w-full">
              {aiLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
              ) : (
                "Send Query to AI"
              )}
            </Button>
            {(aiResponse || aiError) && (
              <div className="mt-4 p-4 rounded-md bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                <h4 className="font-semibold mb-2 text-stone-800 dark:text-stone-200">AI Response:</h4>
                {aiError ? (
                  <p className="text-red-600 dark:text-red-400 text-sm">Error: {aiError}</p>
                ) : (
                  <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{aiResponse}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
