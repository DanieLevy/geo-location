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
import { Loader2, ArrowLeft, Bot, Terminal, AlertCircle, User, Send, Info, FileText, Clock, Milestone, Gauge, CheckCircle, PlusCircle, Mic, Image, BarChart2, Share2, MapPin, ChevronsUpDown, Menu, MessageSquare, Volume2, VolumeX as VolumeMute, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight, Settings2, MoreVertical, Sparkles, Lightbulb } from "lucide-react";
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
import { AnimatePresence, motion } from "framer-motion";

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
  return result.trim() || "0s"; // Ensure it never returns empty string
}

// Helper to identify stops
function findStops(points: DrivePoint[], minStopDurationSeconds: number = 120): number {
    let stopCount = 0;
    let potentiallyStopping = false;
    let stopStartTime: Date | null = null;

    for (let i = 1; i < points.length; i++) {
        const prevPoint = points[i-1];
        const currentPoint = points[i];

        // Safely access speed, default to a high value if undefined to prevent false stop detection
        const currentSpeed = currentPoint.speedKmh ?? 999;
        const prevSpeed = prevPoint.speedKmh ?? 999;
        const prevTimestamp = prevPoint.timestamp;

        if (currentSpeed < 2 && prevSpeed < 2) { // Speed threshold for stop
            if (!potentiallyStopping && prevTimestamp) { // Ensure timestamp exists
                potentiallyStopping = true;
                stopStartTime = new Date(prevTimestamp); // Timestamp is now guaranteed to be a string
            }
        } else {
            if (potentiallyStopping && stopStartTime && prevTimestamp) { // Ensure timestamps exist
                const stopEndTime = new Date(prevTimestamp); // Stop ended at the last low-speed point
                const durationSeconds = (stopEndTime.getTime() - stopStartTime.getTime()) / 1000;
                if (durationSeconds >= minStopDurationSeconds) {
                    stopCount++;
                }
            }
            potentiallyStopping = false;
            stopStartTime = null;
        }
    }
    // Check if stopping at the very end of the data
    const lastTimestamp = points[points.length - 1]?.timestamp;
    if (potentiallyStopping && stopStartTime && lastTimestamp) { // Ensure timestamps exist
         const stopEndTime = new Date(lastTimestamp);
         const durationSeconds = (stopEndTime.getTime() - stopStartTime.getTime()) / 1000;
         if (durationSeconds >= minStopDurationSeconds) {
             stopCount++;
         }
    }

    return stopCount;
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

  // New state variables for AI insights
  const [autoInsights, setAutoInsights] = useState<string[]>([]);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [currentInsightIndex, setCurrentInsightIndex] = useState(0);

  // AI-enhanced statistics
  const [aiStats, setAiStats] = useState<{
    validPoints?: { value: string; note?: string };
    duration?: { value: string; note?: string };
    distance?: { value: string; note?: string };
    avgSpeed?: { value: string; note?: string };
    maxSpeed?: { value: string; note?: string };
    invalid?: { value: string; note?: string };
  }>({});
  const [aiStatsLoading, setAiStatsLoading] = useState(false);

  // --- DEBUG LOG --- Add console log here
  console.log('ProcessPage Render - Loading:', loading, 'Metadata:', metadata ? 'Exists' : 'null', 'Points:', points.length, 'Insights:', autoInsights);

  // Function to generate AI insights automatically
  const generateAiInsights = useCallback(async () => {
    if (!filenames || filenames.length === 0 || !points.length || !metadata) return;
    
    // Don't regenerate if we already have insights and aren't in loading state
    if (autoInsights.length > 0 && !aiInsightsLoading) return;
    
    setAiInsightsLoading(true);
    try {
      // First try to get some basic insights while AI is generating
      const quickInsights: string[] = [];
      if (metadata.maxSpeedKmh) {
        quickInsights.push(`Reached a top speed of ${metadata.maxSpeedKmh.toFixed(0)} km/h.`);
      }
      if (metadata.totalDistanceMeters && metadata.durationSeconds) {
        quickInsights.push(`Covered ${(metadata.totalDistanceMeters / 1000).toFixed(1)} km in ${formatDuration(metadata.durationSeconds)}.`);
      }
      if (quickInsights.length > 0) {
        setAutoInsights(quickInsights);
      }
      
      // Prepare context for AI
      const contextMessage = {
        role: 'system' as const,
        content: `You are analyzing GPS drive data. The data contains ${metadata.totalValidPoints} valid points, covering a journey of ${metadata.durationSeconds ? formatDuration(metadata.durationSeconds) : 'unknown duration'}. 
        ${metadata.totalDistanceMeters ? `The total distance was ${(metadata.totalDistanceMeters / 1000).toFixed(1)} kilometers.` : ''}
        ${metadata.avgSpeedKmh ? `The average speed was ${metadata.avgSpeedKmh.toFixed(0)} km/h.` : ''}
        ${metadata.maxSpeedKmh ? `The maximum speed was ${metadata.maxSpeedKmh.toFixed(0)} km/h.` : ''}
        
        Generate 4-5 insightful observations about this drive. Each insight should be a single sentence and focus on different aspects: speed patterns, duration, distance, stops, or unusual patterns.
        Format your response as a JSON array of strings, with each string being a single insight observation. Keep each insight under 120 characters.
        Example format: ["Insight 1", "Insight 2", "Insight 3", "Insight 4"]`
      };
      
      // Get AI insights
      const result = await getAiDataChatCompletion({
        filenames,
        messages: [contextMessage],
        model: selectedChatModel || undefined,
        stream: false
      });
      
      console.log('AI Insight response:', result.response);
      
      // Try to parse the response as JSON array
      try {
        let aiInsights: string[] = [];
        // Check if the response is already JSON or needs parsing
        if (typeof result.response === 'string') {
          // Find anything that looks like a JSON array in the response
          const jsonMatch = result.response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            aiInsights = JSON.parse(jsonMatch[0]);
          } else {
            // Fallback: split by newlines and clean up
            aiInsights = result.response
              .split('\n')
              .filter(line => line.trim().length > 0)
              .map(line => line.replace(/^[0-9\-\*\•\.]+\s*/, '').trim()) // Remove list markers
              .filter(line => line.length > 10 && line.length < 150); // Reasonable length for insights
          }
        }
        
        // Combine quick insights with AI insights if we have any
        if (aiInsights.length > 0) {
          setAutoInsights(aiInsights);
        } else if (autoInsights.length === 0) {
          // Fallback to basic insights if AI failed and we have no insights
          generateBasicInsights();
        }
      } catch (parseError) {
        console.error('Failed to parse AI insights:', parseError);
        // Fallback to basic insights
        if (autoInsights.length === 0) {
          generateBasicInsights();
        }
      }
    } catch (err) {
      console.error('Error generating AI insights:', err);
      // Fallback to basic insights
      if (autoInsights.length === 0) {
        generateBasicInsights();
      }
    } finally {
      setAiInsightsLoading(false);
    }
  }, [filenames, metadata, points, selectedChatModel, autoInsights, aiInsightsLoading]);
  
  // Generate AI-enhanced statistics for key metrics
  const generateAiStats = useCallback(async () => {
    if (!filenames || filenames.length === 0 || !points.length || !metadata) return;
    
    // Don't regenerate if we already have stats and aren't in loading state
    if (Object.keys(aiStats).length > 0 && !aiStatsLoading) return;
    
    setAiStatsLoading(true);
    
    // Initialize with basic metadata as fallback
    const basicStats = {
      validPoints: { 
        value: metadata.totalValidPoints?.toLocaleString() || 'N/A'
      },
      duration: { 
        value: metadata.durationSeconds ? formatDuration(metadata.durationSeconds) : 'N/A'
      },
      distance: { 
        value: metadata.totalDistanceMeters ? `${(metadata.totalDistanceMeters / 1000).toFixed(1)} km` : 'N/A'
      },
      avgSpeed: { 
        value: metadata.avgSpeedKmh ? `${metadata.avgSpeedKmh.toFixed(0)} km/h` : 'N/A' 
      },
      maxSpeed: { 
        value: metadata.maxSpeedKmh ? `${metadata.maxSpeedKmh.toFixed(0)} km/h` : 'N/A'
      },
      invalid: { 
        value: metadata.totalInvalidPoints?.toLocaleString() || 'N/A'
      }
    };
    
    // Set basic stats immediately while waiting for AI
    setAiStats(basicStats);
    
    try {
      // Prepare context for AI
      const contextMessage = {
        role: 'system' as const,
        content: `You are analyzing GPS drive data. The data contains ${metadata.totalValidPoints} valid points, covering a journey of ${metadata.durationSeconds ? formatDuration(metadata.durationSeconds) : 'unknown duration'}. 
        ${metadata.totalDistanceMeters ? `The total distance was ${(metadata.totalDistanceMeters / 1000).toFixed(1)} kilometers.` : ''}
        ${metadata.avgSpeedKmh ? `The average speed was ${metadata.avgSpeedKmh.toFixed(0)} km/h.` : ''}
        ${metadata.maxSpeedKmh ? `The maximum speed was ${metadata.maxSpeedKmh.toFixed(0)} km/h.` : ''}
        
        Analyze this drive data and provide AI-enhanced statistics with brief insights.
        For each metric, add a short contextual note that gives the user additional understanding.
        
        Format your response as a JSON object with this structure:
        {
          "validPoints": {"value": "16,636", "note": "High density data captures detailed route patterns"},
          "duration": {"value": "45m 20s", "note": "Typical commute time suggests routine travel"},
          "distance": {"value": "28.3 km", "note": "Medium-range journey across urban environment"},
          "avgSpeed": {"value": "37 km/h", "note": "Consistent with city driving conditions"},
          "maxSpeed": {"value": "84 km/h", "note": "Highway segment detected with good flow"},
          "invalid": {"value": "317", "note": "GPS signal interrupted briefly near tall buildings"}
        }
        
        If a metric is missing in the original data, keep its value as "N/A" but still provide an insightful note about what this might mean.
        Keep notes concise (under 60 characters).`
      };
      
      // Get AI enhanced stats
      const result = await getAiDataChatCompletion({
        filenames,
        messages: [contextMessage],
        model: selectedChatModel || undefined,
        stream: false
      });
      
      console.log('AI Stats response:', result.response);
      
      // Try to parse the response as JSON
      try {
        // Check if the response is already JSON or needs parsing
        if (typeof result.response === 'string') {
          // Find anything that looks like a JSON object in the response
          const jsonMatch = result.response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const aiEnhancedStats = JSON.parse(jsonMatch[0]);
            // Merge the AI stats with our basic stats (as fallback)
            setAiStats({
              validPoints: aiEnhancedStats.validPoints || basicStats.validPoints,
              duration: aiEnhancedStats.duration || basicStats.duration,
              distance: aiEnhancedStats.distance || basicStats.distance,
              avgSpeed: aiEnhancedStats.avgSpeed || basicStats.avgSpeed,
              maxSpeed: aiEnhancedStats.maxSpeed || basicStats.maxSpeed,
              invalid: aiEnhancedStats.invalid || basicStats.invalid
            });
          }
        }
      } catch (parseError) {
        console.error('Failed to parse AI stats:', parseError);
        // Keep the basic stats we already set
      }
    } catch (err) {
      console.error('Error generating AI stats:', err);
      // Keep the basic stats we already set
    } finally {
      setAiStatsLoading(false);
    }
  }, [filenames, metadata, points, selectedChatModel, aiStats, aiStatsLoading]);
  
  // Fallback function for basic insights
  const generateBasicInsights = () => {
    if (!points.length || !metadata) return;
    
    const insights: string[] = [];
    if (metadata.maxSpeedKmh) {
      insights.push(`Reached a top speed of ${metadata.maxSpeedKmh.toFixed(0)} km/h.`);
    }
    if (metadata.totalDistanceMeters && metadata.durationSeconds) {
      insights.push(`Covered ${(metadata.totalDistanceMeters / 1000).toFixed(1)} km in ${formatDuration(metadata.durationSeconds)}.`);
    }
    const stops = findStops(points);
    if (stops > 0) {
      insights.push(`Detected ${stops} stop${stops > 1 ? 's' : ''} longer than 2 minutes.`);
    }
    if (metadata.avgSpeedKmh && metadata.maxSpeedKmh && metadata.maxSpeedKmh > metadata.avgSpeedKmh * 1.8) {
      insights.push(`Average speed (${metadata.avgSpeedKmh.toFixed(0)} km/h) suggests varied traffic conditions.`);
    }
    if (metadata.totalInvalidPoints && metadata.totalValidPoints > 0) {
      const invalidRatio = metadata.totalInvalidPoints / (metadata.totalValidPoints + metadata.totalInvalidPoints);
      if (invalidRatio > 0.1) {
        insights.push(`${(invalidRatio * 100).toFixed(0)}% of data points were marked invalid, indicating potential GPS issues.`);
      }
    }
    setAutoInsights(insights.filter(i => i)); // Filter out any empty strings
    setCurrentInsightIndex(0); // Reset index when insights change
  };

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

  // Trigger AI insights generation when data is loaded
  useEffect(() => {
    if (points.length > 0 && metadata && !aiInsightsLoading) {
      generateAiInsights();
    }
  }, [points, metadata, generateAiInsights, aiInsightsLoading]);

  // Trigger AI stats generation when data is loaded
  useEffect(() => {
    if (points.length > 0 && metadata && !aiStatsLoading) {
      generateAiStats();
    }
  }, [points, metadata, generateAiStats, aiStatsLoading]);

  // Cycle through insights
  useEffect(() => {
    if (autoInsights.length > 1) {
      const intervalId = setInterval(() => {
        setCurrentInsightIndex((prevIndex) => (prevIndex + 1) % autoInsights.length);
      }, 8000); // Change insight every 8 seconds

      return () => clearInterval(intervalId); // Cleanup interval on unmount or when insights change
    }
  }, [autoInsights]);

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

  if (loading && !metadata) {
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
      <header className="flex-shrink-0 mb-6">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 dark:from-blue-900 dark:to-indigo-950 shadow-lg">
          {/* Abstract pattern background */}
          <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0,0 L100,0 L100,100 L0,100 Z" fill="url(#grid-pattern)" />
            </svg>
            <defs>
              <pattern id="grid-pattern" patternUnits="userSpaceOnUse" width="10" height="10">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
          </div>
          
          {/* Header content */}
          <div className="relative z-10 px-6 py-5">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Left: Title and auto insights */}
              <div className="md:w-1/2 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FileText className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">Drive Data</h1>
                    <p className="text-blue-100 text-sm">Analysis & Visualization</p>
                  </div>
                </div>
                
                {/* Source files */}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <div className="text-blue-100 text-xs font-medium mr-1">Source:</div>
                  {filenames.slice(0, 2).map(name => (
                    <Badge key={name} variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-none whitespace-nowrap text-xs font-normal" title={name}>
                      {name.length > 20 ? name.substring(0, 17) + '...' : name}
                    </Badge>
                  ))}
                  {filenames.length > 2 && (
                    <Badge variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-none text-xs font-normal">
                      +{filenames.length - 2} more
                    </Badge>
                  )}
                </div>
              </div>

              {/* Right: Key stats card */}
              <div className="md:w-1/2 relative">
                <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-blue-500/20 blur-2xl"></div>
                <div className="relative p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-sm font-medium text-white">Key Statistics</h2>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-blue-100 hover:text-white hover:bg-white/10" onClick={handleGetSummary} disabled={summaryLoading}>
                        <Bot className="mr-1.5 h-3.5 w-3.5" />{summaryLoading ? 'Generating...' : 'AI Summary'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-blue-100 hover:text-white hover:bg-white/10" onClick={handleBackToHome}>
                        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white/10 p-2 rounded-lg group cursor-help">
                            <div className="flex items-center text-xs text-blue-200 mb-1">
                              <CheckCircle className="mr-1 h-3 w-3" /> Valid Points
                              {aiStatsLoading && <Loader2 className="ml-1 h-2 w-2 animate-spin" />}
                            </div>
                            <div className="text-white font-medium flex items-center">
                              {aiStats.validPoints?.value || (metadata?.totalValidPoints?.toLocaleString() ?? 'N/A')}
                              {aiStats.validPoints?.note && (
                                <Sparkles className="ml-1 h-3 w-3 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        {aiStats.validPoints?.note && (
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p className="text-xs">{aiStats.validPoints.note}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white/10 p-2 rounded-lg group cursor-help">
                            <div className="flex items-center text-xs text-blue-200 mb-1">
                              <Clock className="mr-1 h-3 w-3" /> Duration
                              {aiStatsLoading && <Loader2 className="ml-1 h-2 w-2 animate-spin" />}
                            </div>
                            <div className="text-white font-medium flex items-center">
                              {aiStats.duration?.value || (metadata?.durationSeconds ? formatDuration(metadata.durationSeconds) : 'N/A')}
                              {aiStats.duration?.note && (
                                <Sparkles className="ml-1 h-3 w-3 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        {aiStats.duration?.note && (
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p className="text-xs">{aiStats.duration.note}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white/10 p-2 rounded-lg group cursor-help">
                            <div className="flex items-center text-xs text-blue-200 mb-1">
                              <Milestone className="mr-1 h-3 w-3" /> Distance
                              {aiStatsLoading && <Loader2 className="ml-1 h-2 w-2 animate-spin" />}
                            </div>
                            <div className="text-white font-medium flex items-center">
                              {aiStats.distance?.value || (metadata?.totalDistanceMeters ? `${(metadata.totalDistanceMeters / 1000).toFixed(1)} km` : 'N/A')}
                              {aiStats.distance?.note && (
                                <Sparkles className="ml-1 h-3 w-3 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        {aiStats.distance?.note && (
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p className="text-xs">{aiStats.distance.note}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white/10 p-2 rounded-lg group cursor-help">
                            <div className="flex items-center text-xs text-blue-200 mb-1">
                              <Gauge className="mr-1 h-3 w-3" /> Avg Speed
                              {aiStatsLoading && <Loader2 className="ml-1 h-2 w-2 animate-spin" />}
                            </div>
                            <div className="text-white font-medium flex items-center">
                              {aiStats.avgSpeed?.value || (metadata?.avgSpeedKmh ? `${metadata.avgSpeedKmh.toFixed(0)} km/h` : 'N/A')}
                              {aiStats.avgSpeed?.note && (
                                <Sparkles className="ml-1 h-3 w-3 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        {aiStats.avgSpeed?.note && (
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p className="text-xs">{aiStats.avgSpeed.note}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white/10 p-2 rounded-lg group cursor-help">
                            <div className="flex items-center text-xs text-blue-200 mb-1">
                              <Gauge className="mr-1 h-3 w-3" /> Max Speed
                              {aiStatsLoading && <Loader2 className="ml-1 h-2 w-2 animate-spin" />}
                            </div>
                            <div className="text-white font-medium flex items-center">
                              {aiStats.maxSpeed?.value || (metadata?.maxSpeedKmh ? `${metadata.maxSpeedKmh.toFixed(0)} km/h` : 'N/A')}
                              {aiStats.maxSpeed?.note && (
                                <Sparkles className="ml-1 h-3 w-3 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        {aiStats.maxSpeed?.note && (
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p className="text-xs">{aiStats.maxSpeed.note}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white/10 p-2 rounded-lg group cursor-help">
                            <div className="flex items-center text-xs text-blue-200 mb-1">
                              <AlertCircle className="mr-1 h-3 w-3" /> Invalid
                              {aiStatsLoading && <Loader2 className="ml-1 h-2 w-2 animate-spin" />}
                            </div>
                            <div className="text-white font-medium flex items-center">
                              {aiStats.invalid?.value || (metadata?.totalInvalidPoints?.toLocaleString() ?? 'N/A')}
                              {aiStats.invalid?.note && (
                                <Sparkles className="ml-1 h-3 w-3 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        {aiStats.invalid?.note && (
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p className="text-xs">{aiStats.invalid.note}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            </div>
            
            {/* AI Insights Bar */}
            <div className="mt-5 bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600"></div>
              <div className="flex items-center pl-3">
                <div className="flex-shrink-0 mr-3">
                  <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                  </div>
                </div>
                <div className="relative flex-grow min-h-[36px]">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-blue-200 font-medium mb-1 flex items-center">
                      <Lightbulb className="h-3 w-3 mr-1 text-amber-400" /> 
                      AI INSIGHTS
                      {aiInsightsLoading && (
                        <div className="ml-2 flex items-center text-xs text-blue-200/70">
                          <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                          Analyzing...
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {autoInsights.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentInsightIndex(index)}
                          className={cn(
                            "h-1.5 rounded-full transition-all duration-300 ease-in-out",
                            index === currentInsightIndex 
                              ? "w-5 bg-amber-400" 
                              : "w-1.5 bg-white/20 hover:bg-white/30"
                          )}
                          aria-label={`View insight ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <AnimatePresence mode="wait">
                    {aiInsightsLoading && autoInsights.length === 0 ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="text-sm text-white/80 py-1"
                      >
                        <div className="flex items-center">
                          <div className="flex space-x-1 mr-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"></div>
                          </div>
                          Generating AI insights about your drive data...
                        </div>
                      </motion.div>
                    ) : autoInsights[currentInsightIndex] ? (
                      <motion.div
                        key={currentInsightIndex}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="text-sm text-white"
                      >
                        {autoInsights[currentInsightIndex]}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="text-sm text-white/80 italic"
                      >
                        No insights available yet...
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 w-7 p-0 rounded-full text-blue-100 hover:text-white hover:bg-white/10"
                    onClick={() => {
                      if (aiInsightsLoading || autoInsights.length <= 1) return;
                      setCurrentInsightIndex((prevIndex) => (prevIndex + 1) % autoInsights.length);
                    }}
                    disabled={aiInsightsLoading || autoInsights.length <= 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
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