'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import dynamic from 'next/dynamic';
import { DrivePoint } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Bot, Terminal, AlertCircle, User, Send, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { getAiDriveSummary, getAiDataChatCompletion, getAiModels, AiModelInfo } from "@/lib/aiService";
import { cn } from '@/lib/utils';

const DriveMap = dynamic(
  () => import('@/components/DriveMap'),
  { 
    ssr: false,
    loading: () => <div className="w-full h-[600px] bg-gray-100 dark:bg-stone-800 rounded-lg flex items-center justify-center">
      <p className="text-gray-500 dark:text-stone-400">Loading map...</p>
    </div>
  }
);

interface BackendResponseMetadata {
  totalValidPoints: number;
  totalInvalidPoints: number;
  processedFilenames: string[];
  // validationErrors?: any[]; // Keep validation errors structure flexible
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ProcessPage() {
  const searchParams = useSearchParams();
  const filesQuery = searchParams.get('files'); 
  const filenames = filesQuery ? filesQuery.split(',') : [];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<DrivePoint[]>([]);
  const [metadata, setMetadata] = useState<BackendResponseMetadata | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [aiModels, setAiModels] = useState<AiModelInfo[]>([]);
  const [selectedChatModel, setSelectedChatModel] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (filenames.length === 0) {
      setError('No files specified for processing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      console.log('Debug - Fetching data for:', filenames.join(','));
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/csv-data?files=${encodeURIComponent(filenames.join(','))}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch file data' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Debug - Received aggregated data:', data);

      setPoints(data.points || []);
      setMetadata({
        totalValidPoints: data.totalValidPoints || 0,
        totalInvalidPoints: data.totalInvalidPoints || 0,
        processedFilenames: data.processedFilenames || [],
        // validationErrors: data.validationErrors 
      });

    } catch (err: any) {
      console.error('Debug - Error fetching aggregated data:', err);
      setError(err.message || 'Failed to load or parse file data');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesQuery]);

  useEffect(() => {
    fetchData();

    const fetchModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const modelData = await getAiModels();
        setAiModels(modelData.data || []);
        const defaultLoadedModel = modelData.data?.find(m => m.state === 'loaded' && (m.type === 'llm' || m.type === 'vlm'));
        if (defaultLoadedModel) {
          setSelectedChatModel(defaultLoadedModel.id);
        }
      } catch (err: any) {
        console.error("Failed to fetch AI models:", err);
        setModelsError(err.message || "Could not load model list from LM Studio");
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, [fetchData]);

  const handleGetSummary = async () => {
    if (!filenames || filenames.length === 0) return;
    
    setSummaryLoading(true);
    setSummaryText(null);
    setSummaryError(null);

    try {
      const result = await getAiDriveSummary(filenames);
      setSummaryText(result.summary);
    } catch (err: any) {
      console.error("AI Summary Fetch Error:", err);
      setSummaryError(err.message || "Failed to get summary from AI");
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !filenames || filenames.length === 0) return;

    const newUserMessage: ChatMessage = { role: 'user', content: chatInput };
    const updatedMessages = [...chatMessages, newUserMessage];

    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);

    try {
      const payload = {
        filenames,
        messages: updatedMessages,
        model: selectedChatModel,
      };
      const result = await getAiDataChatCompletion(payload);
      const aiResponseMessage: ChatMessage = { role: 'assistant', content: result.response };
      setChatMessages(prev => [...prev, aiResponseMessage]);
    } catch (err: any) {
      console.error("AI Data Chat Error:", err);
      setChatError(err.message || "Failed to get response from AI chat");
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleBackToHome = () => {
    window.location.href = '/';
  };

  const renderDebugInfo = () => {
    return (
      <Card className="mt-4">
         <CardHeader><CardTitle>Processing Summary & Debug</CardTitle></CardHeader>
        <CardContent>
          {metadata ? (
            <pre className="text-xs font-mono bg-stone-100 dark:bg-stone-900 p-4 rounded overflow-x-auto">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          ) : (
            <p>No metadata available.</p>
          )}
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">* Debug info display for validation errors needs refinement for multi-file view.</p>
         </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 bg-stone-100 dark:bg-stone-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="h-12 w-12 text-stone-500 dark:text-stone-400 animate-spin" />
           <p className="text-lg text-stone-600 dark:text-stone-300">Loading map data...</p>
        </div>
       </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8 bg-stone-100 dark:bg-stone-950">
        <main className="max-w-4xl mx-auto">
          <Card className="border-red-500 dark:border-red-700">
            <CardHeader>
               <CardTitle className="text-red-600 dark:text-red-500">Error Loading Data</CardTitle>
            </CardHeader>
            <CardContent>
               <p className="text-stone-700 dark:text-stone-300 mb-6">{error}</p>
               <Button onClick={handleBackToHome} variant="destructive">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
               </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 bg-stone-100 dark:bg-stone-950">
      <header className="flex-shrink-0 mb-4 md:mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl md:text-2xl font-bold mb-1">Processing Files</h1>
                <div className="flex flex-wrap gap-1">
                  {filenames.map(name => (
                    <Badge key={name} variant="secondary" className="whitespace-nowrap">{name}</Badge>
                  ))}
                </div>
                {metadata && (
                  <p className="text-sm text-stone-500 dark:text-stone-400 mt-2">
                    Valid: <span className="font-semibold">{metadata.totalValidPoints.toLocaleString()}</span> | Invalid: <span className="font-semibold">{metadata.totalInvalidPoints.toLocaleString()}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0 items-center">
                <Button size="sm" variant="secondary" onClick={() => setShowDebug(!showDebug)}>{showDebug ? 'Hide Summary' : 'Show Summary'}</Button>
                <Button size="sm" variant="outline" onClick={handleGetSummary} disabled={summaryLoading}>
                  <Bot className="mr-1.5 h-4 w-4" />
                  {summaryLoading ? 'Generating...' : 'Summarize'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleBackToHome}>Home</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </header>

      {summaryLoading || summaryText || summaryError && (
        <div className="flex-shrink-0 mb-4 md:mb-6">
          <Card>
            <CardContent className="p-4">
              {summaryLoading && (
                <div className="flex items-center text-stone-600 dark:text-stone-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating AI summary...
                </div>
              )}
              {summaryError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error Generating Summary</AlertTitle>
                  <AlertDescription>{summaryError}</AlertDescription>
                </Alert>
              )}
              {summaryText && (
                <Alert>
                  <Terminal className="h-4 w-4" />
                  <AlertTitle>AI Summary</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {summaryText}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showDebug && <div className="flex-shrink-0 mb-4 md:mb-6">{renderDebugInfo()}</div>}

      <main className="flex-grow flex flex-col md:flex-row gap-4 md:gap-6 overflow-hidden">
        <div className="flex-grow w-full md:w-2/3 lg:w-3/4 h-[60vh] md:h-auto rounded-lg overflow-hidden shadow-md">
          <DriveMap points={points} />
        </div>
        <div className="flex-shrink-0 w-full md:w-1/3 lg:w-1/4 h-[40vh] md:h-auto">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex-shrink-0">
              <div className="flex justify-between items-start">
                <div className="flex-1 mr-4">
                  <CardTitle className="flex items-center text-lg mb-1">
                    <Bot className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-400" />
                    Chat
                  </CardTitle>
                  <CardDescription className="text-xs">Ask about the loaded data.</CardDescription>
                </div>
                <div className="w-auto max-w-[180px]">
                  <Label htmlFor="chat-model-select" className="text-xs text-stone-500 dark:text-stone-400 mb-1 block">Model:</Label>
                  <Select value={selectedChatModel ?? undefined} onValueChange={(value) => setSelectedChatModel(value)} disabled={modelsLoading || aiModels.length === 0}>
                    <SelectTrigger id="chat-model-select" className="h-8 text-xs">
                      <SelectValue placeholder={modelsLoading ? "Loading..." : (modelsError ? "Error" : "Select...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {modelsError ? (
                        <SelectItem value="error" disabled>{modelsError}</SelectItem>
                      ) : (
                        aiModels.filter(m => m.type === 'llm' || m.type === 'vlm').map(model => (
                          <SelectItem key={model.id} value={model.id} title={model.id} className="text-xs">
                            <div className="flex items-center justify-between w-full">
                              <span className="truncate max-w-[150px]">{model.id}</span>
                              <Badge variant={model.state === 'loaded' ? 'default' : 'outline'} className="ml-1 text-xs px-1 py-0">
                                {model.state}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col p-4 overflow-hidden">
              <ScrollArea className="flex-grow mb-4 border rounded-md bg-stone-50 dark:bg-stone-900" ref={chatContainerRef}>
                <div className="p-4 space-y-4">
                  {chatMessages.map((message, index) => (
                    <div key={index} className={cn("flex items-start gap-3", message.role === 'user' ? 'justify-end' : '')}>
                      <div className={cn("p-2 md:p-3 rounded-lg max-w-[85%]", message.role === 'user' ? 'bg-blue-600 text-white dark:bg-blue-700' : 'bg-stone-200 text-stone-900 dark:bg-stone-700 dark:text-stone-100')}>
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-start gap-3">
                      <div className="p-3 rounded-lg bg-stone-200 text-stone-900 dark:bg-stone-700 dark:text-stone-100">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              {chatError && (
                <Alert variant="destructive" className="mb-4 flex-shrink-0">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Chat Error</AlertTitle>
                  <AlertDescription className="text-xs">{chatError}</AlertDescription>
                </Alert>
              )}
              <div className="flex-shrink-0 flex gap-2">
                <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about the data..." className="flex-1 h-9" disabled={chatLoading} onKeyDown={(e) => e.key === 'Enter' && !chatLoading && handleSendChatMessage()} />
                <Button size="icon" className="h-9 w-9" onClick={handleSendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
} 