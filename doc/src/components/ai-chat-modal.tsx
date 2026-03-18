import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@/types/ai-chat";
import { renderMarkdown } from "@/utils/render-markdown";

interface AiChatModalProps {
  basePath: string;
}

export default function AiChatModal({ basePath }: AiChatModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for toggle event
  useEffect(() => {
    function handleToggle() {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.open) {
        dialog.close();
      } else {
        dialog.showModal();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("toggle-ai-chat", handleToggle);
    return () => window.removeEventListener("toggle-ai-chat", handleToggle);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleClose() {
      setMessages([]);
      setInput("");
      setError(null);
      setLoading(false);
    }
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      dialog.close();
    }
  }

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const base = basePath.replace(/\/+$/, "");
      const res = await fetch(`${base}/api/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else if (typeof data.response === "string" && data.response) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      } else {
        setError("Received an empty or invalid response");
      }
    } catch {
      setError("Failed to connect to the AI assistant");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, basePath]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-0 h-dvh max-h-none w-dvw max-w-none border-none bg-surface p-0 text-fg backdrop:bg-bg/80 lg:m-auto lg:h-[90vh] lg:max-h-[90vh] lg:w-[90vw] lg:max-w-[52.5rem] lg:border-solid lg:border lg:border-fg"
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-muted px-hsp-lg py-vsp-xs">
          <h2 className="text-subheading font-bold text-fg">AI Assistant</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="flex items-center justify-center text-muted transition-colors hover:text-fg"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-hsp-lg py-vsp-sm" aria-live="polite">
          {messages.length === 0 && !loading && (
            <p className="py-vsp-xl text-center text-small text-muted">
              Ask a question about the documentation.
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-vsp-xs flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-t-[1rem] rounded-bl-[1rem] rounded-br-[0.25rem] bg-chat-user-bg px-hsp-md py-vsp-2xs text-small leading-relaxed text-chat-user-text">
                  {msg.content}
                </div>
              ) : (
                <div
                  className="ai-chat-md max-w-[85%] rounded-t-[1rem] rounded-br-[1rem] rounded-bl-[0.25rem] bg-chat-assistant-bg px-hsp-md py-vsp-2xs text-small leading-relaxed text-chat-assistant-text"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )}
            </div>
          ))}
          {loading && (
            <div className="mb-vsp-xs flex justify-start">
              <div className="rounded-t-[1rem] rounded-br-[1rem] rounded-bl-[0.25rem] bg-chat-assistant-bg px-hsp-md py-vsp-2xs text-small text-muted">
                Thinking...
              </div>
            </div>
          )}
          {error && (
            <div className="mb-vsp-xs rounded-[0.75rem] border border-danger bg-bg px-hsp-md py-vsp-2xs text-small text-danger">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-muted px-hsp-lg py-vsp-xs">
          <div className="flex items-center gap-x-hsp-sm">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Type your message..."
              className="flex-1 rounded-full border border-muted bg-bg px-hsp-lg py-vsp-2xs text-small text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="flex h-[2rem] w-[2rem] shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-colors hover:bg-accent-hover disabled:opacity-50"
              aria-label="Send message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
