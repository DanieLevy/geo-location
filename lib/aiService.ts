interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AiChatRequest {
  messages: ChatMessage[];
  model?: string; 
}

interface AiChatResponse {
  response: string; // The AI's generated text
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'; // Use env var or default

export async function getAiChatCompletion(
  payload: AiChatRequest
): Promise<AiChatResponse> {
  try {
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' })); // Attempt to parse error JSON
      console.error('API Error:', response.status, errorData);
      throw new Error(`API request failed with status ${response.status}: ${errorData?.error || 'Unknown error'}`);
    }

    const data: AiChatResponse = await response.json();
    return data;

  } catch (error: any) {
    console.error('Error fetching AI chat completion:', error);
    // Re-throw a more specific error or return a default error response
    throw new Error(`Failed to get AI completion: ${error.message}`);
  }
}

// --- NEW: Function to get drive summary ---
interface AiDriveSummaryResponse {
  summary: string;
}

export async function getAiDriveSummary(
  filenames: string[]
): Promise<AiDriveSummaryResponse> {
  try {
    const response = await fetch(`${API_URL}/api/ai/summarize-drive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filenames }), // Send filenames in the request body
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
      console.error('API Error fetching summary:', response.status, errorData);
      throw new Error(`API request failed with status ${response.status}: ${errorData?.error || 'Unknown summary error'}`);
    }

    const data: AiDriveSummaryResponse = await response.json();
    return data;

  } catch (error: any) {
    console.error('Error fetching AI drive summary:', error);
    throw new Error(`Failed to get AI drive summary: ${error.message}`);
  }
}

// --- NEW: Types for LM Studio Models API (v0) ---
export interface AiModelInfo {
  id: string;
  object: string; // e.g., "model"
  type: 'llm' | 'vlm' | 'embeddings' | string; // Model type
  publisher: string;
  arch: string; 
  compatibility_type: string;
  quantization: string;
  state: 'loaded' | 'not-loaded' | 'loading' | string; // Load state
  max_context_length: number;
  // Add other fields if needed from the v0 API response
}

export interface AiModelListResponse {
  object: string; // e.g., "list"
  data: AiModelInfo[];
}

// --- Updated: Function for data-aware chat ---
interface AiDataChatRequest {
  filenames: string[];
  messages: ChatMessage[]; 
  model?: string | null; // Allow specifying the model (or null/undefined for default)
}

// Response is the same as generic chat
type AiDataChatResponse = AiChatResponse;

export async function getAiDataChatCompletion(
  payload: AiDataChatRequest
): Promise<AiDataChatResponse> {
  try {
    // Prepare payload, removing model if it's null/undefined so backend uses default
    const bodyPayload: any = { ...payload };
    if (!bodyPayload.model) {
      delete bodyPayload.model; 
    }

    const response = await fetch(`${API_URL}/api/ai/chat-with-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload), // Send payload potentially without model key
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' })); 
      console.error('API Error in data chat:', response.status, errorData);
      throw new Error(`API request failed with status ${response.status}: ${errorData?.error || 'Unknown data chat error'}`);
    }

    const data: AiDataChatResponse = await response.json();
    return data;

  } catch (error: any) {
    console.error('Error fetching AI data chat completion:', error);
    throw new Error(`Failed to get AI data chat completion: ${error.message}`);
  }
}

// --- NEW: Function to get available AI models ---
export async function getAiModels(): Promise<AiModelListResponse> {
  try {
    const response = await fetch(`${API_URL}/api/ai/models`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' })); 
      console.error('API Error fetching models:', response.status, errorData);
      throw new Error(`API request failed with status ${response.status}: ${errorData?.error || 'Unknown error fetching models'}`);
    }

    const data: AiModelListResponse = await response.json();
    return data;

  } catch (error: any) {
    console.error('Error fetching AI models:', error);
    throw new Error(`Failed to get AI models: ${error.message}`);
  }
} 