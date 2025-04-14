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