"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useConversation } from "@/hooks/useConversation";
import { useAvatar, type AvatarProvider } from "@/hooks/useAvatar";
import AvatarDisplay from "./AvatarDisplay";
import ChatInterface from "./ChatInterface";

// "fullpage" = fills viewport, auto-starts, two-column desktop / stacked mobile
// "kiosk"    = same as fullpage but no close
// "widget"   = floating FAB bottom-right, expands to small panel
// "embed"    = fills parent container
type WidgetMode = "widget" | "kiosk" | "embed" | "fullpage";

interface AvatarWidgetProps {
  mode?: WidgetMode;
  botSlug: string;
}

export default function AvatarWidget({ mode = "widget", botSlug }: AvatarWidgetProps) {
  const [isOpen, setIsOpen] = useState(mode !== "widget");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isInitialising, setIsInitialising] = useState(false);
  const hasStartedRef = useRef(false);

  const conversation = useConversation();
  const {
    sessionId,
    messages,
    isLoading,
    language,
    setLanguage,
    startSession,
    endSession,
    sendMessage,
    botConfig,
  } = conversation;

  const provider = (botConfig?.avatar_provider as AvatarProvider) || "heygen";
  const avatarId = botConfig?.avatar_id || null;

  const avatar = useAvatar(provider, avatarId);
  const { state: avatarState, stream, connect, speak, disconnect, attachToElement } = avatar;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  const initialise = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    setIsInitialising(true);
    setAvatarFailed(false);
    try {
      await startSession(botSlug, "web");
    } catch {
      /* ignore */
    }
    setIsInitialising(false);
  }, [startSession, botSlug]);

  // Connect avatar once bot config arrives
  useEffect(() => {
    if (!botConfig || avatarState.status !== "idle" || avatarFailed) return;
    connect().then((success) => { if (!success) setAvatarFailed(true); });
  }, [botConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Speak greeting on first connect
  const greetingSpokenRef = useRef(false);
  useEffect(() => {
    if (avatarState.status === "connected" && botConfig && !greetingSpokenRef.current) {
      greetingSpokenRef.current = true;
      const greeting = language === "hi" ? botConfig.greeting_hi : botConfig.greeting_en;
      if (greeting) speak(greeting, botConfig.voice_id || undefined);
    }
  }, [avatarState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start for non-widget modes
  useEffect(() => {
    if (mode !== "widget") initialise();
  }, [mode, initialise]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    await initialise();
  }, [initialise]);

  const handleClose = useCallback(async () => {
    if (mode === "kiosk" || mode === "fullpage") return;
    setIsOpen(false);
    hasStartedRef.current = false;
    greetingSpokenRef.current = false;
    await disconnect();
    await endSession();
    setAvatarFailed(false);
  }, [mode, disconnect, endSession]);

  const handleSendMessage = useCallback(async (text: string) => {
    const response = await sendMessage(text);
    if (response && !avatarFailed && avatarState.status === "connected") {
      await speak(response, botConfig?.voice_id || undefined);
    }
  }, [sendMessage, speak, avatarFailed, avatarState.status, botConfig]);

  const handleRetryAvatar = useCallback(() => {
    setAvatarFailed(false);
    connect().then((s) => { if (!s) setAvatarFailed(true); });
  }, [connect]);

  const botName = botConfig?.bot_name || "Avtar";
  const themeColor = botConfig?.theme_color || "#f97316";

  // ---------------------------------------------------------------------------
  // Mode: fullpage / kiosk — full-screen, two-column desktop / stacked mobile
  // ---------------------------------------------------------------------------

  if (mode === "fullpage" || mode === "kiosk") {
    // Full-screen loading splash
    if (isInitialising || !sessionId) {
      return (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-6"
          style={{ background: "linear-gradient(135deg, #111827 0%, #1f2937 50%, #111827 100%)" }}
        >
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}88)` }}
            >
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <div
              className="absolute inset-0 rounded-full border-2 animate-ping opacity-50"
              style={{ borderColor: themeColor }}
            />
          </div>
          <div className="text-center">
            <p className="text-white text-xl font-semibold">{botName}</p>
            <p className="text-gray-400 text-sm mt-1">Starting your session…</p>
          </div>
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${themeColor} transparent transparent transparent` }}
          />
        </div>
      );
    }

    return (
      <div
        className="fixed inset-0 flex flex-col"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)" }}
      >
        {/* ── Top brand strip ── */}
        <div className="flex-shrink-0 text-center py-1.5 text-xs text-gray-500 border-b border-white/5">
          <span className="font-semibold text-gray-300">RLAI Avatar Studios</span>
          {" · "}
          <a href="https://rightleft.ai" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 transition-colors">rightleft.ai</a>
        </div>

        {/* ── Header ── */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/10"
          style={{ background: `${themeColor}18` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}bb)` }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm md:text-base leading-tight">{botName}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">AI Assistant</span>
                {avatarState.status === "connected" && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-400 text-xs">Live</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Language selector in header */}
          <div className="flex items-center gap-1.5">
            {(["en", "hi", "hinglish"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors font-medium ${
                  language === lang
                    ? "text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
                style={language === lang ? { background: themeColor } : {}}
              >
                {lang === "en" ? "EN" : lang === "hi" ? "हि" : "HG"}
              </button>
            ))}
          </div>
        </header>

        {/* ── Main body: two-column desktop, stacked mobile ── */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

          {/* Avatar column */}
          <div className={`flex-shrink-0 ${avatarFailed ? "hidden md:hidden" : ""}
            h-[42vw] max-h-72 md:max-h-none md:h-auto md:flex-1 md:max-w-[58%]
            p-2 md:p-5`}
          >
            {avatarFailed ? null : (
              <AvatarDisplay
                stream={stream}
                state={avatarState}
                provider={provider}
                botName={botName}
                onRetry={handleRetryAvatar}
                hideProvider={true}
                attachToElement={attachToElement}
              />
            )}
          </div>

          {/* Chat column */}
          <div
            className={`flex-1 min-h-0 flex flex-col overflow-hidden
              ${avatarFailed ? "w-full" : "md:w-[42%] md:max-w-[520px]"}
              md:my-4 md:mr-4 rounded-t-3xl md:rounded-3xl shadow-2xl`}
            style={{ background: "#ffffff" }}
          >
            {/* Text-only banner */}
            {avatarFailed && (
              <div
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-white text-xs rounded-t-3xl"
                style={{ background: `linear-gradient(to right, ${themeColor}, ${themeColor}cc)` }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <span>Text chat active — avatar unavailable</span>
                <button
                  onClick={handleRetryAvatar}
                  className="ml-auto underline underline-offset-2 opacity-80 hover:opacity-100"
                >
                  Retry
                </button>
              </div>
            )}

            <ChatInterface
              messages={messages}
              isLoading={isLoading}
              language={language}
              onLanguageChange={setLanguage}
              onSendMessage={handleSendMessage}
              botName={botName}
              themeColor={themeColor}
              hideLanguageSelector
            />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Mode: widget — floating FAB → small panel
  // ---------------------------------------------------------------------------

  if (mode === "widget") {
    const smallPanel = (
      <div className="flex flex-col bg-white shadow-2xl rounded-2xl overflow-hidden w-80 h-[540px]">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0"
          style={{ background: `linear-gradient(to right, ${themeColor}, ${themeColor}dd)` }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm">{botName}</p>
              <p className="text-xs text-white/70 capitalize">{provider} Avatar</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {avatarFailed && (
          <div className="bg-orange-50 border-b border-orange-100 px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span className="text-orange-600 text-xs">Text chat active — avatar unavailable</span>
          </div>
        )}

        {!avatarFailed && (
          <div className="h-44 flex-shrink-0">
            <AvatarDisplay
              stream={stream}
              state={avatarState}
              provider={provider}
              botName={botName}
              onRetry={handleRetryAvatar}
              attachToElement={attachToElement}
            />
          </div>
        )}

        <div className="flex-1 min-h-0">
          {isInitialising || !sessionId ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div
                  className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
                  style={{ borderColor: `${themeColor} transparent transparent transparent` }}
                />
                <p className="text-gray-400 text-xs">Starting session…</p>
              </div>
            </div>
          ) : (
            <ChatInterface
              messages={messages}
              isLoading={isLoading}
              language={language}
              onLanguageChange={setLanguage}
              onSendMessage={handleSendMessage}
              botName={botName}
              themeColor={themeColor}
            />
          )}
        </div>
      </div>
    );

    return (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isOpen && smallPanel}
        {!isOpen && (
          <button
            onClick={handleOpen}
            className="w-14 h-14 rounded-full text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
            title={`Chat with ${botName}`}
          >
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Mode: embed — fills parent container
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col w-full h-full bg-white rounded-xl overflow-hidden shadow-lg">
      <div
        className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0"
        style={{ background: `linear-gradient(to right, ${themeColor}, ${themeColor}dd)` }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
          <span className="font-semibold text-sm">{botName}</span>
        </div>
      </div>
      {!avatarFailed && (
        <div className="h-48 flex-shrink-0">
          <AvatarDisplay stream={stream} state={avatarState} provider={provider} botName={botName} onRetry={handleRetryAvatar} attachToElement={attachToElement} />
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ChatInterface
          messages={messages}
          isLoading={isLoading}
          language={language}
          onLanguageChange={setLanguage}
          onSendMessage={handleSendMessage}
          botName={botName}
          themeColor={themeColor}
        />
      </div>
    </div>
  );
}
