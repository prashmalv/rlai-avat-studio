/**
 * useConversation.ts — React hook managing the full conversation lifecycle.
 *
 * Responsibilities:
 *  - Start a session via POST /api/session/start with a bot slug.
 *  - Receive bot config snapshot (provider, avatarId, voice, greeting) in response.
 *  - Send messages via POST /api/chat and append to the local messages array.
 *  - End the session via POST /api/session/end.
 *  - Track language (en / hi / hinglish) for chat context.
 */

"use client";

import { useState, useCallback } from "react";
import { api, type BotSessionConfig } from "@/lib/api";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export type Language = "en" | "hi" | "hinglish";

export interface UseConversationReturn {
  sessionId: string | null;
  messages: Message[];
  isLoading: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  botConfig: BotSessionConfig | null;
  startSession: (botSlug: string, channel?: string, customerName?: string) => Promise<void>;
  endSession: () => Promise<void>;
  sendMessage: (text: string) => Promise<string | null>;
  clearMessages: () => void;
  error: string | null;
}

let msgCounter = 0;
function newId() {
  return `msg_${Date.now()}_${++msgCounter}`;
}

export function useConversation(): UseConversationReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [botConfig, setBotConfig] = useState<BotSessionConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(
    async (botSlug: string, channel = "web", customerName?: string) => {
      setError(null);
      try {
        const data = await api.startSession(botSlug, customerName, channel);
        setSessionId(data.session_id);
        setBotConfig(data.bot);

        // Insert greeting as the first assistant message
        const greeting =
          language === "hi" ? data.bot.greeting_hi : data.bot.greeting_en;

        if (greeting) {
          setMessages([
            {
              id: newId(),
              role: "assistant",
              content: greeting,
              timestamp: new Date(),
            },
          ]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to start session";
        setError(msg);
        throw err;
      }
    },
    [language]
  );

  const endSession = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      await api.endSession(sessionId);
    } catch (err) {
      // Non-critical — log but don't surface to user
      console.warn("endSession failed:", err);
    } finally {
      setSessionId(null);
    }
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string): Promise<string | null> => {
      if (!sessionId || !text.trim()) return null;

      const userMsg: Message = {
        id: newId(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setError(null);

      try {
        const data = await api.chat(sessionId, text.trim(), language);
        const assistantMsg: Message = {
          id: newId(),
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        return data.response;
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Failed to get response";
        setError(errMsg);
        const errorMsg: Message = {
          id: newId(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, language]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    sessionId,
    messages,
    isLoading,
    language,
    setLanguage,
    botConfig,
    startSession,
    endSession,
    sendMessage,
    clearMessages,
    error,
  };
}
