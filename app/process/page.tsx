'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import dynamic from 'next/dynamic';
import { DrivePoint } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Bot, Terminal, AlertCircle, User, Send, Info, FileText, Clock, Milestone, Gauge, CheckCircle, PlusCircle, Mic, Image, BarChart2, Share2, MapPin, ChevronsUpDown, Menu, MessageSquare, Volume2, VolumeX as VolumeMute, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight, Settings2, MoreVertical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { toast } from "sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { getAiDriveSummary, getAiDataChatCompletion, getAiModels, AiModelInfo } from "@/lib/aiService";

// --- Start: Web Speech API Type Definitions ---
// Based on MDN and common usage
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string; // e.g., 'no-speech', 'audio-capture', 'not-allowed'
  readonly message: string;
}

// Define the constructor interface
interface SpeechRecognitionStatic {
  new (): SpeechRecognition;
}

// Define the instance interface
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

// Extend the Window interface
interface CustomWindow extends Window {
  SpeechRecognition?: SpeechRecognitionStatic;
  webkitSpeechRecognition?: SpeechRecognitionStatic;
}
declare let window: CustomWindow;
// --- End: Web Speech API Type Definitions ---

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
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  highlightPoints?: number[]; // Indices of points to highlight on map
  visualData?: {
    type: 'chart' | 'highlight' | 'stats';
    data: any;
  };
  feedback?: 'positive' | 'negative';
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
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // New state variables
  const [highlightedPoints, setHighlightedPoints] = useState<number[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [audioOutput, setAudioOutput] = useState(false);
  const [showSuggestedPrompts, setShowSuggestedPrompts] = useState(true);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null); // Ref for SpeechRecognition instance

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

  // Suggested prompts based on the data context
  const suggestedPrompts = [
    "Summarize the key stats from this drive data",
    "Where did this drive start and end?", 
    "What was the average speed during this journey?",
    "Identify any unusual driving patterns",
    "When did the vehicle stop for more than 5 minutes?",
    "Show the fastest segments of this drive"
  ];

  // Handle voice input
  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Speech Recognition Not Supported", {
        description: "Your browser doesn't support speech recognition.",
      });
      return;
    }

    if (isListening) {
      // Stop listening
      recognitionRef.current?.stop();
      setIsListening(false); // Directly set state here, onend will also fire
      // Consider removing the toast here if onend handles UI updates
      // toast.info("Stopped Listening", {
      //   description: "Voice input canceled."
      // });
    } else {
      // Start listening
      if (recognitionRef.current) {
        // Clean up previous instance if somehow exists
        recognitionRef.current.abort();
      }
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false; // Capture a single utterance
      recognitionRef.current.interimResults = false; // We only want the final result
      recognitionRef.current.lang = 'en-US'; // Or make this configurable

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        toast("Listening...", {
          description: "Speak now.",
          duration: 5000, // Show for 5 seconds or until stopped/result
        });
      };

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setChatInput(transcript);
        toast.success("Speech Recognized", {
          description: `"${transcript}"`,
        });
        // Optionally send message immediately after recognition
        // handleSendChatMessage();
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error, event.message);
        let errorMessage = "An unknown error occurred during speech recognition.";
        switch (event.error) {
          case 'no-speech':
            errorMessage = "No speech was detected. Please try again.";
            break;
          case 'audio-capture':
            errorMessage = "Audio capture failed. Ensure microphone is connected and working.";
            break;
          case 'not-allowed':
            errorMessage = "Microphone access denied. Please allow access in your browser settings.";
            break;
          case 'network':
             errorMessage = "Network error during speech recognition. Check connection.";
            break;
          case 'aborted':
            // This can happen if stop() or abort() is called, often expected.
            console.log("Speech recognition aborted.");
            // Don't show an error toast for manual aborts.
            setIsListening(false); // Ensure state is correct
            return; // Exit early, no error toast needed
          default:
            errorMessage = `Error: ${event.error}. ${event.message}`;
        }
        toast.error("Speech Recognition Error", {
          description: errorMessage,
        });
        setIsListening(false); // Ensure listening state is reset on error
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        console.log("Speech recognition ended.");
        // Optional: Add a toast indicating listening finished if not handled elsewhere
        // toast.info("Listening finished.");
      };

      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("Failed to start speech recognition:", error);
        toast.error("Could not start listening", {
          description: "Please ensure microphone permissions are granted and try again."
        });
        setIsListening(false);
        recognitionRef.current = null; // Clear the ref if start failed
      }
    }
  };

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type and size
    if (!file.type.startsWith('image/')) {
      toast.error("Invalid File Type", {
        description: "Please upload an image file.",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error("File Too Large", {
        description: "Please upload an image smaller than 5MB.",
      });
      return;
    }

    // Create a message with the image (simulated for now)
    toast.info("Image Uploaded", {
      description: "Processing image for analysis...",
    });

    // Simulate AI processing the image
    setTimeout(() => {
      const newUserMessage: ChatMessage = { 
        role: 'user', 
        content: `[Uploaded image: ${file.name}]` 
      };
      
      setChatMessages(prev => [...prev, newUserMessage]);
      
      // Simulate AI response
      setTimeout(() => {
        const aiResponse: ChatMessage = {
          role: 'assistant',
          content: "I've analyzed the image you uploaded. It appears to show a route map with traffic conditions. Based on the colors shown, there seems to be congestion in the northern section of the route. This matches the GPS data which shows slower speeds in that area between timestamps 1255-1276."
        };
        setChatMessages(prev => [...prev, aiResponse]);
      }, 2000);
    }, 1500);

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle highlighting points on map
  const handleHighlightPoints = (indices: number[]) => {
    // Disable highlighting by not setting any points (keep the function for compatibility)
    // setHighlightedPoints(indices); - removing this line
    
    // Change toast to indicate highlighting is disabled
    toast.info("Map Highlighting Disabled", {
      description: `Highlighting map points has been disabled by user preference.`,
    });
  };

  // Function to add system context message before sending to AI
  const prepareSystemContext = () => {
    // Create a rich context message that helps the AI understand the data
    let systemContext = "You are a data analysis assistant specializing in GPS drive data. ";
    
    // Add detailed information about data structure
    systemContext += "The data structure you're analyzing contains these key fields:\n";
    systemContext += "- frameId: Numeric identifier for each GPS point. Each unique GPS reading has a unique frameId.\n";
    systemContext += "- lat: Latitude coordinate (decimal degrees)\n";
    systemContext += "- lng: Longitude coordinate (decimal degrees)\n";
    systemContext += "- altitude: Height above sea level (meters, optional)\n";
    systemContext += "- speedKmh: Vehicle speed in kilometers per hour\n";
    systemContext += "- timestamp: ISO date string indicating when the point was recorded\n";
    systemContext += "- sourceFile: Original CSV file this data point came from\n\n";
    
    // Add explanation of available capabilities
    systemContext += "You have these capabilities to help with data analysis:\n";
    systemContext += "1. You can access all GPS points in the dataset with their coordinates, speeds, and timestamps\n";
    systemContext += "2. You can highlight specific points on the map using [[HIGHLIGHT:index1,index2,...]] tags\n";
    systemContext += "3. You can generate charts and visualizations using [[CHART:type,title,data]] tags\n";
    systemContext += "4. You can analyze driving patterns, speeds, stops, and route characteristics\n\n";
    
    if (metadata) {
      systemContext += `The current dataset contains ${metadata.totalValidPoints} valid GPS points, `;
      
      if (metadata.durationSeconds) {
        systemContext += `covering a journey of approximately ${(metadata.durationSeconds / 60).toFixed(0)} minutes. `;
      }
      
      if (metadata.totalDistanceMeters) {
        systemContext += `The total distance was ${(metadata.totalDistanceMeters / 1000).toFixed(1)} kilometers. `;
      }
      
      if (metadata.avgSpeedKmh && metadata.maxSpeedKmh) {
        systemContext += `The average speed was ${metadata.avgSpeedKmh.toFixed(0)} km/h with a maximum of ${metadata.maxSpeedKmh.toFixed(0)} km/h. `;
      }
      
      if (metadata.processedFilenames && metadata.processedFilenames.length > 0) {
        systemContext += `Data source files: ${metadata.processedFilenames.join(", ")}. `;
      }
    }
    
    systemContext += "IMPORTANT: When users mention 'frameId', they are referring to the numeric identifier of each GPS point. "; 
    systemContext += "Do NOT confuse frameId with latitude/longitude values. frameId is a sequential identifier, NOT a coordinate. ";
    systemContext += "When asked about unique frameIds, count the actual number of distinct frameId values. ";
    
    return systemContext;
  };

  // Add a function to cancel streaming
  const cancelStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !filenames || filenames.length === 0) return;

    // Cancel any ongoing streaming
    cancelStreaming();
    
    // Create a new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    // Add system context message at the beginning of each new conversation
    const contextMessage: ChatMessage = { 
      role: 'system', 
      content: prepareSystemContext()
    };

    const newUserMessage: ChatMessage = { role: 'user', content: chatInput };
    const newAssistantMessage: ChatMessage = { role: 'assistant', content: '', isStreaming: true };
    
    // Only include system message if it's the first message or after 5 messages
    const shouldAddContext = chatMessages.length === 0 || chatMessages.length >= 5 && !chatMessages.some(m => m.role === 'system');
    
    if (shouldAddContext) {
      setChatMessages(prev => [...prev, contextMessage, newUserMessage, newAssistantMessage]);
    } else {
      setChatMessages(prev => [...prev, newUserMessage, newAssistantMessage]);
    }
    
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    setStreamingContent("");
    setIsStreaming(true);

    try {
      const messagesForAi = shouldAddContext 
        ? [contextMessage, ...chatMessages, newUserMessage]
        : [...chatMessages, newUserMessage];
        
      const payload = {
        filenames,
        messages: messagesForAi,
        model: selectedChatModel || undefined,
        stream: true,
        includeMetadata: true // Send metadata to the AI service
      };

      // Simulating streaming response for now
      let fullResponse = "";
      
      // Extract any special commands from the response
      const processResponse = (text: string) => {
        // Check for highlight command
        const highlightMatch = text.match(/\[\[HIGHLIGHT:([0-9,]+)\]\]/);
        if (highlightMatch && highlightMatch[1]) {
          const indices = highlightMatch[1].split(',').map(idx => parseInt(idx.trim()));
          
          // Clean the response text by removing the highlight command
          const cleanedText = text.replace(/\[\[HIGHLIGHT:[0-9,]+\]\]/, '');
          
          // Update the message with highlight data and cleaned text
          setChatMessages(prev => {
            // Safety check to make sure we have messages
            if (prev.length === 0) return prev;
            
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = cleanedText;
              lastMessage.highlightPoints = indices;
            }
            return newMessages;
          });
          
          // Highlight the points on the map
          handleHighlightPoints(indices);
          return cleanedText;
        }
        
        // Check for chart command
        const chartMatch = text.match(/\[\[CHART:([^,]+),([^,]+),([^\]]+)\]\]/);
        if (chartMatch && chartMatch.length > 3) {
          const chartType = chartMatch[1];
          const chartTitle = chartMatch[2];
          const chartData = chartMatch[3];
          
          // Clean the response text
          const cleanedText = text.replace(/\[\[CHART:[^\]]+\]\]/, '');
          
          // Update the message with chart data
          setChatMessages(prev => {
            // Safety check to make sure we have messages
            if (prev.length === 0) return prev;
            
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = cleanedText;
              lastMessage.visualData = {
                type: 'chart',
                data: {
                  type: chartType,
                  title: chartTitle,
                  data: chartData
                }
              };
            }
            return newMessages;
          });
          
          return cleanedText;
        }
        
        return text;
      };
      
      // Start with empty content and simulate streaming
      const simulateStreaming = async () => {
        try {
          // Define isComponentMounted at the start of the function
          let isComponentMounted = true;
          
      const result = await getAiDataChatCompletion(payload);
          let responseText = result.response;
          
          // For very large responses, use a more efficient approach
          if (responseText.length > 20000) {
            // For large responses, update in larger chunks rather than word-by-word
            // to avoid excessive DOM updates
            toast.info("Processing Large Response", {
              description: `Response is ${(responseText.length/1024).toFixed(1)}KB. Processing chunks...`
            });
            
            const chunkSize = 5000; // Process in 5KB chunks
            let processedLength = 0;
            
            while (processedLength < responseText.length) {
              // Check abort conditions
              if (!isComponentMounted || 
                  !abortControllerRef.current || 
                  abortControllerRef.current.signal.aborted) {
                break;
              }
              
              // Get next chunk
              const nextChunk = responseText.substring(
                processedLength, 
                Math.min(processedLength + chunkSize, responseText.length)
              );
              
              processedLength += nextChunk.length;
              fullResponse = responseText.substring(0, processedLength);
              
              // Update UI with current progress
              setStreamingContent(fullResponse);
              setChatMessages(prev => {
                if (prev.length === 0) return prev;
                
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  lastMessage.content = fullResponse;
                }
                return newMessages;
              });
              
              // Small delay between chunks for UI responsiveness
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          } else {
            // Original word-by-word logic for smaller responses
            const words = responseText.split(' ');
            
            for (let i = 0; i < words.length; i++) {
              if (!isComponentMounted || 
                  !abortControllerRef.current || 
                  abortControllerRef.current.signal.aborted) {
                break;
              }
              
              await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 50));
              fullResponse += (i === 0 ? '' : ' ') + words[i];
              setStreamingContent(fullResponse);
              
              setChatMessages(prev => {
                if (prev.length === 0) return prev;
                
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  lastMessage.content = fullResponse;
                }
                return newMessages;
              });
            }
          }
          
          // Process commands and finalize response
          const processedResponse = processResponse(fullResponse);
          
          // Streaming complete, update with processed response
          setChatMessages(prev => {
            // If chat was cleared, don't update
            if (prev.length === 0) return prev;
            
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = processedResponse;
              lastMessage.isStreaming = false;
            }
            return newMessages;
          });
          
          // Speak the response if audio output is enabled
          if (audioOutput) {
            speakText(processedResponse);
          }

          // Cleanup on component unmount
          return () => {
            isComponentMounted = false;
          };
        } catch (error: unknown) {
          // Handle cancellation error silently
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('Streaming was cancelled');
            return;
          }
          throw error;
        } finally {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      };

      simulateStreaming();
    } catch (err: any) {
      console.error("AI Data Chat Error:", err);
      setChatError(err.message || "Failed to get response from AI chat");
      
      // Remove the empty assistant message if there was an error
      setChatMessages(prev => {
        if (prev.length === 0) return prev;
        return prev.slice(0, prev.length - 1);
      });
    } finally {
      setChatLoading(false);
    }
  };

  // Speak text using Web Speech API
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
      toast.error("Speech Synthesis Not Supported", {
        description: "Your browser doesn't support speech synthesis.",
      });
      return;
    }
    
    // Clean text of markdown and special syntax
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
      .replace(/\*(.*?)\*/g, '$1')     // Remove italic markdown
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // Remove links
      .replace(/```[\s\S]*?```/g, 'Code block omitted') // Replace code blocks
      .replace(/`(.*?)`/g, '$1');      // Remove inline code
      
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  // Toggle audio output
  const toggleAudioOutput = () => {
    const newState = !audioOutput;
    setAudioOutput(newState);
    
    if (newState) {
      toast.info("Audio Output Enabled", {
        description: "AI responses will be spoken aloud."
      });
    } else {
      // Stop any current speech
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      
      toast.info("Audio Output Disabled", {
        description: "AI responses will be text only."
      });
    }
  };

  // Handle feedback on AI responses
  const handleFeedback = (messageIndex: number, type: 'positive' | 'negative') => {
    setChatMessages(prev => {
      const newMessages = [...prev];
      if (newMessages[messageIndex] && newMessages[messageIndex].role === 'assistant') {
        newMessages[messageIndex].feedback = type;
      }
      return newMessages;
    });
    
    toast.success(type === 'positive' ? "Positive Feedback Recorded" : "Negative Feedback Recorded", {
      description: "Thank you for your feedback. This helps improve AI responses."
    });
    
    // Here you would normally send this feedback to your backend
    console.log(`Feedback recorded for message ${messageIndex}: ${type}`);
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Add cleanup for speech recognition
  useEffect(() => {
    // This runs when the component unmounts
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // Use abort to stop immediately without firing 'onresult'
        console.log("Speech recognition aborted on component unmount.");
        recognitionRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

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
    // If content is excessively long (over 50KB), render a simplified version
    // for performance reasons but allow viewing the full content
    if (content.length > 50000) {
      return (
        <div className="markdown-content text-[11px]">
          <div className="p-2 mb-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 rounded-md">
            <p className="text-yellow-700 dark:text-yellow-400 mb-1 font-medium">Very Large Response ({(content.length/1024).toFixed(0)}KB)</p>
            <p className="text-xs">Displaying simplified view for better performance.</p>
          </div>
          <ReactMarkdown 
            components={{
              p: ({node, ...props}) => <div className="markdown-content text-[11px]" {...props} />,
              strong: ({node, ...props}) => <span className="font-bold" {...props} />,
              em: ({node, ...props}) => <span className="italic" {...props} />,
              h1: ({node, ...props}) => <h1 className="text-sm font-bold mt-1.5 mb-1" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-xs font-bold mt-1.5 mb-1" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-xs font-semibold mt-1 mb-0.5" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc ml-3 mt-1 mb-1 space-y-0.5" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal ml-3 mt-1 mb-1 space-y-0.5" {...props} />,
              li: ({node, ...props}) => <li className="ml-2" {...props} />,
              code: ({node, ...props}) => <code className="px-1 py-0.5 bg-stone-300/30 dark:bg-stone-700/30 rounded text-[0.9em]" {...props} />,
              pre: ({node, ...props}) => <pre className="my-1 p-2 bg-stone-200 dark:bg-stone-800 rounded-md overflow-x-auto text-[0.85em]" {...props} />,
            }}
          >
            {/* Only render first 10KB for preview */}
            {content.substring(0, 10000)}
          </ReactMarkdown>
          <div className="mt-2 text-center">
            <button 
              className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-400 rounded text-[10px]"
              onClick={() => {
                // Create a blob and download the full content
                const blob = new Blob([content], {type: 'text/markdown'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'ai-response.md';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              Download Full Response
            </button>
          </div>
        </div>
      );
    }

    // Normal rendering for reasonably sized content
    return (
      <ReactMarkdown 
        components={{
          p: ({node, ...props}) => <div className="markdown-content text-[11px]" {...props} />,
          strong: ({node, ...props}) => <span className="font-bold" {...props} />,
          em: ({node, ...props}) => <span className="italic" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-sm font-bold mt-1.5 mb-1" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xs font-bold mt-1.5 mb-1" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-xs font-semibold mt-1 mb-0.5" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc ml-3 mt-1 mb-1 space-y-0.5" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal ml-3 mt-1 mb-1 space-y-0.5" {...props} />,
          li: ({node, ...props}) => <li className="ml-2" {...props} />,
          code: ({node, ...props}) => <code className="px-1 py-0.5 bg-stone-300/30 dark:bg-stone-700/30 rounded text-[0.9em]" {...props} />,
          pre: ({node, ...props}) => <pre className="my-1 p-2 bg-stone-200 dark:bg-stone-800 rounded-md overflow-x-auto text-[0.85em]" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  // Update clear chat logic to cancel streaming
  const handleClearChat = () => {
    // Cancel any ongoing streaming
    cancelStreaming();
    
    // Clear chat messages
    setChatMessages([]);
    
    // Reset UI state
    setShowSuggestedPrompts(true);
    setHighlightedPoints([]);
    
    // Notify user
    toast.info("Conversation Cleared", {
      description: "Started a new conversation."
    });
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
                  <Loader2 className="mr-2 h-4 animate-spin" />
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

      <main className="flex-grow flex flex-col md:flex-row gap-4 md:gap-6 min-h-0">
        <div className="flex-grow w-full md:w-2/3 lg:w-3/4 h-[50vh] md:h-auto rounded-lg overflow-hidden shadow-md">
          <DriveMap points={points} highlightedPoints={highlightedPoints} />
        </div>
        
        <div className="w-full md:w-1/3 lg:w-1/4 h-[40vh] md:h-auto flex flex-col">
          <div className="h-full flex flex-col bg-white dark:bg-stone-900 rounded-lg overflow-hidden shadow-sm border border-stone-200 dark:border-stone-800 max-h-[550px]">
            <div className="flex-shrink-0 flex items-center px-3 py-2 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                  <Bot size={12} className="text-white" />
                </div>
                <span className="text-sm">Data Assistant</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {chatMessages.length > 0 && (
                  <button 
                    onClick={handleClearChat}
                    className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  >
                    Clear
                  </button>
                )}
                <Select 
                  value={selectedChatModel ?? undefined} 
                  onValueChange={(value) => setSelectedChatModel(value)}
                >
                  <SelectTrigger className="h-6 text-xs w-auto min-w-[90px] border-none bg-transparent hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                    <div className="flex items-center gap-1 truncate">
                      {modelsLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <div className="flex items-center">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full mr-1",
                            selectedChatModel ? "bg-green-500" : "bg-stone-400"
                          )} />
                          <span className="truncate text-xs text-stone-500">{selectedChatModel ? selectedChatModel.split('/').pop() : "Select model"}</span>
                        </div>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5} className="text-xs">
                    {modelsError ? (
                      <SelectItem value="error" disabled className="text-red-500 dark:text-red-400">
                        <AlertCircle className="h-3 w-3 mr-1 inline-block" />Error loading models
                      </SelectItem>
                    ) : (
                      aiModels
                        .filter(m => m.type === 'llm' || m.type === 'vlm')
                        .sort((a, b) => {
                          if (a.state === 'loaded' && b.state !== 'loaded') return -1;
                          if (a.state !== 'loaded' && b.state === 'loaded') return 1;
                          return a.id.localeCompare(b.id);
                        })
                        .map(model => (
                          <SelectItem 
                            key={model.id} 
                            value={model.id} 
                            className="text-xs py-1"
                          >
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "h-2 w-2 rounded-full",
                                model.state === 'loaded' ? "bg-green-500" : "bg-stone-300 dark:bg-stone-600"
                              )} />
                              <span className="truncate">{model.id.split('/').pop()}</span>
                            </div>
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex-grow overflow-hidden min-h-0 relative">
              <ScrollArea className="h-full px-3 py-2" ref={chatContainerRef}>
                <div className="space-y-3 pb-2">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-10 text-center">
                      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-3">
                        <MessageSquare className="h-5 w-5 text-stone-400" />
                      </div>
                      <p className="text-xs text-stone-500 dark:text-stone-400 max-w-[200px] mb-4">
                        Ask questions about your drive data
                      </p>
                      
                      {/* Simplified suggested prompts */}
                      {showSuggestedPrompts && (
                        <div className="space-y-1.5 w-full max-w-[250px]">
                          {suggestedPrompts.map((prompt, index) => (
                            <button
                              key={index}
                              className="w-full text-left px-2.5 py-1.5 rounded text-xs bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 transition-colors"
                              onClick={() => {
                                setChatInput(prompt);
                                setShowSuggestedPrompts(false);
                              }}
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Simplified message rendering
                    chatMessages.map((message, index) => {
                      // Skip system messages
                      if (message.role === 'system') return null;
                      
                      const isUser = message.role === 'user';
                      
                      return (
                        <div key={index} className={cn(
                          "flex",
                          isUser ? "justify-end" : "justify-start"
                        )}>
                          <div className={cn(
                            "max-w-sm px-2.5 py-1.5 rounded-lg text-xs",
                            isUser 
                              ? "bg-blue-500 text-white" 
                              : "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                          )}>
                            {isUser ? (
                              <div className="whitespace-pre-wrap">{message.content}</div>
                            ) : (
                              <div>
                                {message.isStreaming ? (
                                  <div className="relative">
                                    {renderMarkdown(message.content)}
                                    <span className="inline-block w-1 h-3 bg-blue-500 dark:bg-blue-400 ml-0.5 animate-pulse" />
                                  </div>
                                ) : (
                                  renderMarkdown(message.content)
                                )}
                                
                                {message.visualData && (
                                  <div className="mt-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded p-1.5">
                                    <div className="text-[10px] font-medium mb-1">{message.visualData.data.title || "Data"}</div>
                                    <div className="bg-stone-100 dark:bg-stone-800 rounded h-16 flex items-center justify-center">
                                      <BarChart2 className="h-6 w-6 text-stone-400 opacity-50" />
                                    </div>
                                  </div>
                                )}
                                
                                {/* Minimalist feedback */}
                                {!message.isStreaming && (
                                  <div className="flex justify-end gap-2 mt-1 opacity-50 hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => handleFeedback(index, 'positive')}
                                      className={cn(
                                        "text-stone-400 hover:text-green-500",
                                        message.feedback === 'positive' && "text-green-500"
                                      )}
                                      aria-label="Helpful"
                                    >
                                      <ThumbsUp size={10} />
                                    </button>
                                    <button 
                                      onClick={() => handleFeedback(index, 'negative')}
                                      className={cn(
                                        "text-stone-400 hover:text-red-500",
                                        message.feedback === 'negative' && "text-red-500"
                                      )}
                                      aria-label="Not helpful"
                                    >
                                      <ThumbsDown size={10} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  
                  {/* Minimal loading indicator */}
                  {chatLoading && !chatMessages.some(m => m.isStreaming) && (
                    <div className="flex justify-start">
                      <div className="bg-stone-100 dark:bg-stone-800 px-3 py-1.5 rounded-lg text-xs max-w-[85%]">
                        <div className="flex space-x-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-stone-600 animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-stone-600 animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-stone-600 animate-bounce"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            
            <div className="flex-shrink-0 px-3 py-2 border-t border-stone-100 dark:border-stone-800">
              {chatError && (
                <div className="mb-2 px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded text-[10px] text-red-600 dark:text-red-400 flex items-center">
                  <AlertCircle size={10} className="mr-1 flex-shrink-0" />
                  {chatError}
                </div>
              )}
              
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Message..."
                    className="h-8 text-xs pl-2.5 pr-8 rounded-full bg-stone-100 dark:bg-stone-800 border-none focus-visible:ring-1 focus-visible:ring-blue-500"
                    disabled={chatLoading}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChatMessage()}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex">
                    <button
                      className={cn(
                        "p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200",
                        isListening && "text-red-500"
                      )}
                      onClick={handleVoiceInput}
                      aria-label="Voice input"
                    >
                      <Mic size={14} />
                    </button>
                  </div>
                </div>
                
                <button
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center",
                    chatInput.trim() && !chatLoading
                      ? "bg-blue-500 hover:bg-blue-600 text-white" 
                      : "bg-stone-200 dark:bg-stone-700 text-stone-400 dark:text-stone-500 cursor-not-allowed"
                  )}
                  disabled={!chatInput.trim() || chatLoading}
                  onClick={handleSendChatMessage}
                  aria-label="Send message"
                >
                  <Send size={14} />
                </button>
              </div>
              
              {/* Ultra-minimal utility buttons */}
              <div className="flex justify-between mt-1 px-1">
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  aria-label="Upload image"
                >
                  <Image size={12} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                
                <button 
                  onClick={toggleAudioOutput} 
                  className={cn(
                    "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300",
                    audioOutput && "text-blue-500"
                  )}
                  aria-label={audioOutput ? "Disable speech" : "Enable speech"}
                >
                  {audioOutput ? <Volume2 size={12} /> : <VolumeMute size={12} />}
                </button>
              </div>
              
              <div className="text-[8px] text-center text-stone-400 mt-1">
                Local LLM
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 