/**
 * VoiceInput.tsx — Voice-to-text input button using the Web Speech API.
 *
 * Supports en-IN (English) and hi-IN (Hindi) based on the selected language.
 * Shows animated mic icon while recording. Calls onResult with the transcript.
 * Falls back gracefully on browsers without Speech Recognition support.
 */

"use client";

import { useState, useRef, useCallback } from "react";
import type { Language } from "@/hooks/useConversation";

interface VoiceInputProps {
  onResult: (transcript: string) => void;
  language: Language;
  disabled?: boolean;
}

const LANG_MAP: Record<Language, string> = {
  en: "en-IN",
  hi: "hi-IN",
  hinglish: "hi-IN",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any;

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export default function VoiceInput({ onResult, language, disabled }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const recognitionRef = useRef<SpeechRecognitionInstance>(null);

  const startRecording = useCallback(() => {
    if (!isSupported || disabled) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = LANG_MAP[language];
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionInstance) => {
      const transcript = event.results[0][0].transcript as string;
      onResult(transcript);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.start();
    setIsRecording(true);
  }, [isSupported, disabled, language, onResult]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  if (!isSupported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled}
      title={isRecording ? "Stop recording" : "Voice input"}
      className={`p-2.5 rounded-full transition-all duration-200 ${
        isRecording
          ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
          : "bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {isRecording ? (
        // Stop icon
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        // Microphone icon
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 9a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V23h-2v-2.06A9 9 0 0 1 3 12h2z" />
        </svg>
      )}
    </button>
  );
}
