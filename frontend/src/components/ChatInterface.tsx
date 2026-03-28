/**
 * ChatInterface.tsx — Chat messages panel with text + voice input.
 *
 * Features:
 *  - Scrollable message list (auto-scrolls to bottom on new messages)
 *  - Language selector: English / Hindi / Hinglish
 *  - Animated typing indicator while waiting for response
 *  - Text input with Enter-to-send
 *  - VoiceInput button integration
 *  - User messages: right-aligned blue bubbles
 *  - Assistant messages: left-aligned gray bubbles with bot name badge
 */

"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import type { Message, Language } from "@/hooks/useConversation";
import VoiceInput from "./VoiceInput";

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onSendMessage: (text: string) => void;
  botName: string;
  disabled?: boolean;
  themeColor?: string;
  hideLanguageSelector?: boolean;
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatInterface({
  messages,
  isLoading,
  language,
  onLanguageChange,
  onSendMessage,
  botName,
  disabled = false,
  themeColor = "#f97316",
  hideLanguageSelector = false,
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || disabled || isLoading) return;
    onSendMessage(text);
    setInputText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceResult = (transcript: string) => {
    if (transcript.trim()) {
      onSendMessage(transcript.trim());
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Language selector — hidden when parent header shows it */}
      {!hideLanguageSelector && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
          <span className="text-xs text-gray-500 mr-1">Language:</span>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.value}
              onClick={() => onLanguageChange(lang.value)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors font-medium ${
                language === lang.value
                  ? "text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300"
              }`}
              style={language === lang.value ? { background: themeColor } : {}}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm text-center">
              Start a conversation with {botName}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}
            >
              {/* Bot name for assistant messages */}
              {msg.role === "assistant" && (
                <span className="text-xs text-gray-400 px-1">{botName}</span>
              )}

              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white rounded-br-sm"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>

              <span className="text-xs text-gray-400 px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex flex-col items-start gap-1">
              <span className="text-xs text-gray-400 px-1">{botName}</span>
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <VoiceInput
            onResult={handleVoiceResult}
            language={language}
            disabled={disabled || isLoading}
          />

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${botName} anything...`}
            disabled={disabled || isLoading}
            className="flex-1 px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-full border-none outline-none placeholder-gray-400 disabled:opacity-50"
          />

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || disabled || isLoading}
            className="p-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full transition-colors flex-shrink-0"
            style={{ background: themeColor }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
