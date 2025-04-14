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
import { Loader2, ArrowLeft, Bot, Terminal, AlertCircle, User, Send, Info, FileText, Clock, Milestone, Gauge, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

import { getAiDriveSummary, getAiDataChatCompletion, getAiModels, AiModelInfo } from "@/lib/aiService";

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
  durationSeconds?: number;
  totalDistanceMeters?: number;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

// Helper function to format seconds into H:M:S or M:S
function formatDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "N/A";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  let result = '';
  if (hours > 0) {
    result += `${hours}h `;
  }
  if (minutes > 0 || hours > 0) { // Show minutes if hours exist or minutes > 0
    result += `${minutes}m `;
  }
  result += `${seconds}s`;
  return result.trim();
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
  const [streamingContent, setStreamingContent] = useState("");
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
        durationSeconds: data.durationSeconds,
        totalDistanceMeters: data.totalDistanceMeters,
        avgSpeedKmh: data.avgSpeedKmh,
        maxSpeedKmh: data.maxSpeedKmh,
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
    const newAssistantMessage: ChatMessage = { role: 'assistant', content: '', isStreaming: true };
    
    setChatMessages(prev => [...prev, newUserMessage, newAssistantMessage]);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    setStreamingContent("");

    try {
      const payload = {
        filenames,
        messages: [...chatMessages, newUserMessage],
        model: selectedChatModel,
        stream: true,
      };

      // Simulating streaming response for now
      // In a real implementation, you would connect to a streaming API endpoint
      let fullResponse = "";
      
      // Start with empty content and simulate streaming
      const simulateStreaming = async () => {
        const result = await getAiDataChatCompletion(payload);
        const responseText = result.response;
        
        // Simulate word-by-word typing
        const words = responseText.split(' ');
        for (let i = 0; i < words.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 70)); // Random delay for natural effect
          fullResponse += (i === 0 ? '' : ' ') + words[i];
          setStreamingContent(fullResponse);
          
          // Update the last message in the chat messages array
          setChatMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = fullResponse;
            return newMessages;
          });
        }
        
        // Streaming complete
        setChatMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          lastMessage.content = fullResponse;
          lastMessage.isStreaming = false;
          return newMessages;
        });
      };

      simulateStreaming();
    } catch (err: any) {
      console.error("AI Data Chat Error:", err);
      setChatError(err.message || "Failed to get response from AI chat");
      
      // Remove the empty assistant message if there was an error
      setChatMessages(prev => prev.slice(0, prev.length - 1));
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

  // Function to render markdown content with syntax highlighting
  const renderMarkdown = (content: string) => {
    return (
      <ReactMarkdown 
        components={{
          root: ({node, ...props}) => <div className="markdown-content text-sm" {...props} />,
          strong: ({node, ...props}) => <span className="font-bold" {...props} />,
          em: ({node, ...props}) => <span className="italic" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-lg font-bold mt-2 mb-1" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-base font-bold mt-2 mb-1" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-sm font-bold mt-1 mb-0.5" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc ml-4 mt-1 mb-1" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal ml-4 mt-1 mb-1" {...props} />,
          li: ({node, ...props}) => <li className="ml-2" {...props} />,
          code: ({node, ...props}) => <code className="px-1 py-0.5 bg-stone-300/30 dark:bg-stone-700/30 rounded" {...props} />,
          pre: ({node, ...props}) => <pre className="my-1 p-2 bg-stone-200 dark:bg-stone-800 rounded-md overflow-x-auto text-xs" {...props} />,
          p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
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
          <CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start">
              <div className="md:col-span-1 space-y-2">
                <h1 className="text-xl font-semibold flex items-center">
                  <FileText className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-400" /> Drive Data
                </h1>
                <p className="text-sm text-muted-foreground">
                  Visualizing drive data from selected files. Use the map and chat below to explore.
                </p>
                <div className="pt-1">
                  <span className="text-xs font-medium text-muted-foreground">Source File(s):</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {filenames.slice(0, 3).map(name => (
                      <Badge key={name} variant="secondary" className="whitespace-nowrap text-xs font-normal" title={name}>{name.length > 25 ? name.substring(0, 22) + '...' : name}</Badge>
                    ))}
                    {filenames.length > 3 && (
                      <Badge variant="outline" className="text-xs font-normal">+{filenames.length - 3} more</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="md:col-span-1 space-y-3 bg-stone-50 dark:bg-stone-900 p-3 rounded-md border">
                 <h2 className="text-sm font-medium text-muted-foreground border-b pb-1 mb-2">Key Statistics</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center" title="Total Valid Points">
                     <CheckCircle className="mr-1.5 h-4 w-4 text-green-600" /> 
                     <span className="font-medium">{metadata?.totalValidPoints?.toLocaleString() ?? 'N/A'}</span><span className="ml-1 text-muted-foreground text-xs">Valid Pts</span>
                  </div>
                   <div className="flex items-center" title="Approximate Duration">
                     <Clock className="mr-1.5 h-4 w-4 text-blue-600" /> 
                     <span className="font-medium">{metadata?.durationSeconds ? formatDuration(metadata.durationSeconds) : 'N/A'}</span>
                  </div>
                   <div className="flex items-center" title="Approximate Distance">
                     <Milestone className="mr-1.5 h-4 w-4 text-purple-600" /> 
                     <span className="font-medium">{metadata?.totalDistanceMeters ? `${(metadata.totalDistanceMeters / 1000).toFixed(1)} km` : 'N/A'}</span>
                  </div>
                   <div className="flex items-center" title="Average Speed">
                     <Gauge className="mr-1.5 h-4 w-4 text-orange-600" /> 
                     <span className="font-medium">{metadata?.avgSpeedKmh ? `${metadata.avgSpeedKmh.toFixed(0)} km/h` : 'N/A'}</span><span className="ml-1 text-muted-foreground text-xs">Avg</span>
                  </div>
                   <div className="flex items-center" title="Maximum Speed">
                     <Gauge className="mr-1.5 h-4 w-4 text-red-600" /> 
                     <span className="font-medium">{metadata?.maxSpeedKmh ? `${metadata.maxSpeedKmh.toFixed(0)} km/h` : 'N/A'}</span><span className="ml-1 text-muted-foreground text-xs">Max</span>
                  </div>
                   <div className="flex items-center" title="Total Invalid Points">
                     <AlertCircle className="mr-1.5 h-4 w-4 text-yellow-600" /> 
                     <span className="font-medium">{metadata?.totalInvalidPoints?.toLocaleString() ?? 'N/A'}</span><span className="ml-1 text-muted-foreground text-xs">Invalid Pts</span>
                  </div>
                 </div>
              </div>

              <div className="md:col-span-1 flex flex-col md:items-end gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleGetSummary} disabled={summaryLoading}>
                    <Bot className="mr-1.5 h-4 w-4" />{summaryLoading ? 'Generating...' : 'Summarize (AI)'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowDebug(!showDebug)}>
                     <Info className="mr-1.5 h-4 w-4" />{showDebug ? 'Hide Raw Summary' : 'Show Raw Summary'}
                </Button>
                </div>
                <div className="mt-auto md:mt-4">
                   <Button size="sm" variant="outline" onClick={handleBackToHome}>
                     <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Upload
                </Button>
                 </div>
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
          <Card className="h-full flex flex-col bg-white dark:bg-stone-900/80 backdrop-blur-sm">
            <CardHeader className="flex-shrink-0 border-b dark:border-stone-700 pb-3">
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7 border border-blue-200 dark:border-blue-800"> 
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white"><Bot size={16} /></AvatarFallback>
                     </Avatar>
                    <CardTitle className="text-base font-semibold">Data Chat</CardTitle>
                 </div>
                 <TooltipProvider delayDuration={150}> 
                    <div className="relative">
                      {selectedChatModel && (
                        <div className="absolute -top-1 -right-1 z-10">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                          </span>
                        </div>
                      )}
                      <Select 
                        value={selectedChatModel ?? undefined} 
                        onValueChange={(value) => setSelectedChatModel(value)} 
                        disabled={modelsLoading || aiModels.length === 0}
                      >
                        <SelectTrigger 
                          id="chat-model-select" 
                          className="h-9 text-xs w-auto min-w-[140px] max-w-[180px] flex-shrink-0 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm rounded-lg data-[placeholder]:text-muted-foreground"
                          aria-label="Select Chat Model"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {modelsLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : selectedChatModel ? (
                              <div className="bg-blue-100 dark:bg-blue-900/40 h-5 w-5 rounded-full flex items-center justify-center">
                                <Bot size={12} className="text-blue-600 dark:text-blue-400" />
                              </div>
                            ) : (
                              <div className="h-5 w-5 rounded-full flex items-center justify-center bg-stone-100 dark:bg-stone-700">
                                <Terminal size={12} className="text-stone-500" />
                              </div>
                            )}
                            <SelectValue placeholder={modelsLoading ? "Loading models..." : (modelsError ? "Error loading models" : "Select AI model...")} />
                          </div>
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={5} className="max-h-[300px] overflow-y-auto">
                          <div className="flex items-center px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
                            <div className="flex-1">Available Models</div>
                            <div className="w-[60px] text-center">Status</div>
                          </div>
                          {modelsError ? (
                            <SelectItem value="error" disabled className="text-red-500 dark:text-red-400">
                              <AlertCircle className="h-3.5 w-3.5 mr-2 inline-block" />{modelsError}
                            </SelectItem>
                          ) : (
                            aiModels
                              .filter(m => m.type === 'llm' || m.type === 'vlm')
                              .sort((a, b) => {
                                // Sort by load state (loaded first) then by name
                                if (a.state === 'loaded' && b.state !== 'loaded') return -1;
                                if (a.state !== 'loaded' && b.state === 'loaded') return 1;
                                return a.id.localeCompare(b.id);
                              })
                              .map(model => (
                                <SelectItem 
                                  key={model.id} 
                                  value={model.id} 
                                  className="text-xs flex items-center justify-between py-1.5"
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2 truncate max-w-[180px]">
                                          <div className={cn(
                                            "h-4 w-4 rounded-full flex-shrink-0 flex items-center justify-center", 
                                            model.state === 'loaded' 
                                              ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" 
                                              : "bg-stone-100 dark:bg-stone-800 text-stone-500"
                                          )}>
                                            {model.state === 'loading' ? (
                                              <Loader2 size={10} className="animate-spin" />
                                            ) : (
                                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                            )}
                                          </div>
                                          <span className="truncate">{model.id}</span>
                                        </div>
                                        <Badge 
                                          variant={model.state === 'loaded' ? 'default' : 'outline'} 
                                          className={cn(
                                            "ml-2 text-xs px-1.5 py-0 font-mono min-w-[50px] text-center",
                                            model.state === 'loaded' && 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300 border-green-300 dark:border-green-700',
                                            model.state === 'loading' && 'bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-300 border-blue-300 dark:border-blue-700 animate-pulse'
                                          )}
                                        >
                                          {model.state}
                                        </Badge>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-[300px] p-3">
                                      <div className="space-y-1.5">
                                        <p className="font-medium">{model.id}</p>
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                          <div className="text-muted-foreground">Type:</div>
                                          <div>{model.type}</div>
                                          <div className="text-muted-foreground">Publisher:</div>
                                          <div>{model.publisher}</div>
                                          <div className="text-muted-foreground">Architecture:</div>
                                          <div>{model.arch}</div>
                                          <div className="text-muted-foreground">Context length:</div>
                                          <div>{model.max_context_length.toLocaleString()}</div>
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </SelectItem>
                              ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                 </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col p-3 h-[calc(40vh-80px)] md:h-[calc(100vh-400px)] overflow-hidden">
              {/* Scrollable messages area */}
              <div className="flex-grow overflow-hidden">
                <ScrollArea className="h-full pr-2" ref={chatContainerRef}>
                  <div className="space-y-4 py-2">
                    {chatMessages.map((message, index) => (
                      <div key={index} className={cn(
                        "flex items-end gap-2", 
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}>
                        {message.role === 'assistant' && (
                          <div className="flex-shrink-0 mt-auto">
                            <Avatar className="h-7 w-7 border-2 border-blue-200 dark:border-blue-800 ring-2 ring-white dark:ring-stone-900">
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                                <Bot size={14} />
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        )}
                        <div 
                          className={cn(
                            "py-2.5 px-3.5 rounded-2xl shadow-sm max-w-[85%]",
                            message.role === 'user' 
                              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-sm' 
                              : 'bg-stone-100 dark:bg-stone-800 rounded-bl-sm border border-stone-200 dark:border-stone-700'
                          )}
                        >
                          {message.role === 'assistant' && message.isStreaming ? (
                            <div className="relative">
                              {renderMarkdown(message.content)}
                              <span className="inline-block w-1.5 h-4 bg-blue-500 dark:bg-blue-400 ml-0.5 animate-pulse" />
                            </div>
                          ) : (
                            message.role === 'assistant' ? (
                              renderMarkdown(message.content)
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                            )
                          )}
                        </div>
                        {message.role === 'user' && (
                          <div className="flex-shrink-0 mt-auto">
                            <Avatar className="h-7 w-7 border-2 border-blue-300 dark:border-blue-700 ring-2 ring-white dark:ring-stone-900">
                              <AvatarFallback className="bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-700 dark:to-stone-800 text-stone-600 dark:text-stone-300">
                                <User size={14} />
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        )}
                      </div>
                    ))}
                    {chatLoading && !chatMessages.some(m => m.isStreaming) && (
                      <div className="flex items-end gap-2 justify-start">
                        <div className="flex-shrink-0">
                          <Avatar className="h-7 w-7 border-2 border-blue-200 dark:border-blue-800 ring-2 ring-white dark:ring-stone-900">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                              <Bot size={14} />
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="p-3 rounded-2xl max-w-[85%] bg-stone-100 dark:bg-stone-800 rounded-bl-sm border border-stone-200 dark:border-stone-700">
                          <div className="flex space-x-2 items-center h-6 px-1"> 
                            <span className="h-2 w-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="h-2 w-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="h-2 w-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce"></span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
              
              {chatError && (
                <Alert variant="destructive" className="mb-2 mt-2 flex-shrink-0">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-xs font-medium">Chat Error</AlertTitle>
                  <AlertDescription className="text-xs">
                    {chatError}
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Fixed input area */}
              <div className="flex-shrink-0 flex items-center gap-2 pt-3 mt-2 border-t dark:border-stone-700">
                <Input 
                  value={chatInput} 
                  onChange={(e) => setChatInput(e.target.value)} 
                  placeholder="Ask about the data..." 
                  className="flex-1 h-11 rounded-full px-4 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus-visible:ring-1 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-600 shadow-sm"
                  disabled={chatLoading}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !chatLoading && (handleSendChatMessage(), e.preventDefault())}
                /> 
                <Button 
                  size="icon" 
                  className="h-11 w-11 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white flex-shrink-0 shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                  onClick={handleSendChatMessage} 
                  disabled={chatLoading || !chatInput.trim()}
                  title="Send Message"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
} 