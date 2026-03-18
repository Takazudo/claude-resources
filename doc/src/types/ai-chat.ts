export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  message: string;
  history: ChatMessage[];
}

export interface AiChatResponse {
  response: string;
}

export interface AiChatErrorResponse {
  error: string;
}
