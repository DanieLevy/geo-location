import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, FileText, Loader2, SearchIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CsvDebuggerProps {
  onClose?: () => void;
}

export function CsvDebugger({ onClose }: CsvDebuggerProps) {
  const [files, setFiles] = useState<{filename: string, uploadedAt: string, size: number}[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch file list on mount
  React.useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/files`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error fetching files:', error);
      setError('Failed to fetch file list');
    } finally {
      setLoadingFiles(false);
    }
  };

  const analyzeFile = async (filename: string) => {
    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    
    try {
      console.log(`Analyzing file: ${filename}`);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/csv-analyze/${filename}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Analysis result:', data);
      setAnalysisResult(data);
    } catch (error) {
      console.error('Error analyzing file:', error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (value: string) => {
    setSelectedFile(value);
    analyzeFile(value);
  };

  const renderColumnMismatchWarning = () => {
    if (!analysisResult?.format) return null;
    
    const { headerColumnCount, firstDataRowColumnCount, columnMismatch } = analysisResult.format;
    
    if (columnMismatch) {
      return (
        <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-800 rounded-md text-yellow-800 dark:text-yellow-300 text-sm mb-4">
          <div className="flex items-center gap-2 font-medium mb-1">
            <AlertCircle className="h-4 w-4" />
            Column count mismatch detected!
          </div>
          <p>Header has {headerColumnCount} columns, but data row has {firstDataRowColumnCount} columns.</p>
          <p className="mt-1">This can cause parsing errors as the data may not align with expected columns.</p>
        </div>
      );
    }
    return null;
  };

  const renderCriticalFieldsStatus = () => {
    if (!analysisResult?.criticalFields) return null;
    
    const fields = Object.entries(analysisResult.criticalFields);
    
    return (
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Critical Fields Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {fields.map(([name, data]: [string, any]) => (
            <div 
              key={name}
              className={`p-2 rounded-md border ${data.isNumeric ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}
            >
              <div className="text-xs font-medium mb-1">{name}</div>
              <div className="text-xs">
                Value: <code className="px-1 bg-white/50 dark:bg-black/20 rounded">{data.value || 'EMPTY'}</code>
              </div>
              <div className="text-xs mt-1 flex gap-2 flex-wrap">
                {data.isNumeric && <span className="px-1 bg-green-200 dark:bg-green-800 rounded-sm">Numeric</span>}
                {data.isInteger && <span className="px-1 bg-green-200 dark:bg-green-800 rounded-sm">Integer</span>}
                {data.isDate && <span className="px-1 bg-green-200 dark:bg-green-800 rounded-sm">Date</span>}
                {data.isEmpty && <span className="px-1 bg-red-200 dark:bg-red-800 rounded-sm">Empty</span>}
                {!data.isNumeric && !data.isEmpty && <span className="px-1 bg-red-200 dark:bg-red-800 rounded-sm">Non-numeric</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRandomSamples = () => {
    if (!analysisResult?.randomSamples?.length) return null;
    
    return (
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Random Data Samples</h3>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 dark:bg-stone-800">
              <tr>
                <th className="px-2 py-1 text-left">Line #</th>
                <th className="px-2 py-1 text-left">Content</th>
              </tr>
            </thead>
            <tbody>
              {analysisResult.randomSamples.map((sample: any, index: number) => (
                <tr key={index} className="border-t border-stone-200 dark:border-stone-700">
                  <td className="px-2 py-1">{sample.lineNumber}</td>
                  <td className="px-2 py-1 font-mono truncate" title={sample.content}>
                    {sample.content.length > 60 
                      ? `${sample.content.substring(0, 60)}...` 
                      : sample.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderHeaderInfo = () => {
    if (!analysisResult?.format?.headers) return null;
    
    return (
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Header Columns</h3>
        <div className="overflow-x-auto rounded-md border border-stone-200 dark:border-stone-700">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 dark:bg-stone-800">
              <tr>
                <th className="px-2 py-1 text-left">Index</th>
                <th className="px-2 py-1 text-left">Column Name</th>
                <th className="px-2 py-1 text-left">Expected Field</th>
              </tr>
            </thead>
            <tbody>
              {analysisResult.format.headers.map((header: string, index: number) => {
                const isExpectedField = Object.entries(analysisResult.expectedMappings)
                  .find(([_, columnIndex]) => `Column ${index}` === columnIndex);
                
                return (
                  <tr 
                    key={index} 
                    className={`border-t border-stone-200 dark:border-stone-700 ${
                      isExpectedField ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <td className="px-2 py-1">{index}</td>
                    <td className="px-2 py-1 font-mono">{header}</td>
                    <td className="px-2 py-1">
                      {isExpectedField ? (
                        <span className="px-1 bg-blue-100 dark:bg-blue-800 rounded-sm">
                          {isExpectedField[0]}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>CSV Debugger</CardTitle>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        )}
      </CardHeader>
      
      <CardContent>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
            Select CSV File to Analyze
          </label>
          
          <div className="flex gap-2">
            <Select
              disabled={loadingFiles}
              value={selectedFile || undefined}
              onValueChange={handleFileSelect}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a file..." />
              </SelectTrigger>
              <SelectContent>
                {loadingFiles ? (
                  <SelectItem value="loading" disabled>
                    <span className="flex items-center">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Loading files...
                    </span>
                  </SelectItem>
                ) : files.length > 0 ? (
                  files.map(file => (
                    <SelectItem key={file.filename} value={file.filename}>
                      <span className="flex items-center">
                        <FileText className="h-3 w-3 mr-1" />
                        {file.filename} ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No files available</SelectItem>
                )}
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={fetchFiles}
              disabled={loadingFiles}
            >
              {loadingFiles ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md mb-4">
            <div className="flex items-center text-red-800 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          </div>
        )}
        
        {loading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-stone-500" />
            <span className="ml-2 text-stone-600 dark:text-stone-400">Analyzing file...</span>
          </div>
        )}
        
        {analysisResult && !loading && (
          <div>
            <div className="mb-4 p-3 bg-stone-100 dark:bg-stone-800 rounded-md">
              <h3 className="text-sm font-medium mb-1">File Information</h3>
              <p className="text-xs"><strong>Filename:</strong> {analysisResult.filename}</p>
              <p className="text-xs"><strong>Size:</strong> {(analysisResult.fileSize / 1024).toFixed(2)} KB</p>
              <p className="text-xs"><strong>Total Lines:</strong> {analysisResult.format.totalLines}</p>
              <p className="text-xs"><strong>Column Count:</strong> {analysisResult.format.headerColumnCount}</p>
              <p className="text-xs"><strong>Format:</strong> {analysisResult.format.hasBOM ? 'UTF-8 with BOM' : 'Standard CSV'}</p>
              <p className="text-xs"><strong>Last Modified:</strong> {new Date(analysisResult.lastModified).toLocaleString()}</p>
            </div>
            
            {renderColumnMismatchWarning()}
            
            {analysisResult.format?.hasBOM && (
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-800 rounded-md text-blue-800 dark:text-blue-300 text-sm mb-4">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <AlertCircle className="h-4 w-4" />
                  UTF-8 BOM detected
                </div>
                <p>This file has a Byte Order Mark (BOM) which may cause problems with some parsers.</p>
              </div>
            )}
            
            {/* Troubleshooting Section */}
            <div className="mb-6 p-4 border border-red-200 dark:border-red-800 rounded-md bg-red-50 dark:bg-red-900/20">
              <h3 className="text-sm font-medium mb-2 text-red-700 dark:text-red-400">Trouble Loading Files?</h3>
              <div className="space-y-2 text-xs text-red-700 dark:text-red-400">
                <p className="font-medium">Common issues that prevent CSV files from loading:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Column count:</strong> Your CSV must have at least 17 columns (this app needs columns at specific positions)</li>
                  <li><strong>Critical fields:</strong> Columns 5 (speed), 9 (lat), 10 (lng), 15 (frameId) must contain valid numbers</li>
                  <li><strong>Format:</strong> Some spreadsheet programs add quotes or formatting that can cause parsing errors</li>
                  <li className="text-xs"><strong>Solution:</strong> Try to normalize your CSV file with a tool like Excel/Google Sheets and save as CSV UTF-8</li>
                </ul>
                
                {/* File quick stats */}
                {analysisResult && (
                  <div className="mt-3 border-t border-red-200 dark:border-red-700 pt-2">
                    <p className="font-medium">This file status:</p>
                    <ul className="mt-1">
                      <li>Column count: <span className={`font-mono ${analysisResult.format.headerColumnCount < 17 ? 'font-bold' : ''}`}>
                        {analysisResult.format.headerColumnCount} {analysisResult.format.headerColumnCount < 17 ? '❌ (needs 17+)' : '✓'}
                      </span></li>
                      <li>Data rows: <span className="font-mono">{analysisResult.format.totalLines - 1}</span></li>
                      <li>Format: <span className="font-mono">{analysisResult.format.hasBOM ? 'UTF-8 with BOM' : 'Standard CSV'}</span></li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
            
            <Tabs defaultValue="fields">
              <TabsList className="mb-4">
                <TabsTrigger value="fields">Critical Fields</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
                <TabsTrigger value="samples">Data Samples</TabsTrigger>
              </TabsList>
              
              <TabsContent value="fields">
                {renderCriticalFieldsStatus()}
                
                <div className="p-3 bg-stone-100 dark:bg-stone-800 rounded-md">
                  <h3 className="text-sm font-medium mb-2">Expected Column Mapping</h3>
                  <p className="text-xs mb-2">This application expects specific fields in these columns:</p>
                  <ul className="text-xs list-disc pl-5 space-y-1">
                    <li><strong>frameId:</strong> Column 1</li>
                    <li><strong>latitude:</strong> Column 5</li>
                    <li><strong>longitude:</strong> Column 6</li>
                    <li><strong>altitude:</strong> Column 7</li>
                    <li><strong>speed:</strong> Column 11</li>
                    <li><strong>timestamp:</strong> Column 16</li>
                  </ul>
                </div>
              </TabsContent>
              
              <TabsContent value="headers">
                {renderHeaderInfo()}
              </TabsContent>
              
              <TabsContent value="samples">
                {renderRandomSamples()}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 