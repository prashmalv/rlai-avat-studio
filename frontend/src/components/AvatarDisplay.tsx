"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarState } from "@/hooks/useAvatar";

interface AvatarDisplayProps {
  stream: MediaStream | null;
  state: AvatarState;
  provider: string;
  botName: string;
  onRetry?: () => void;
  hideProvider?: boolean;
  attachToElement?: ((el: HTMLMediaElement) => void) | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  heygen: "HeyGen",
  did: "D-ID",
  simli: "Simli",
};

export default function AvatarDisplay({
  stream,
  state,
  provider,
  botName,
  onRetry,
  hideProvider = false,
  attachToElement = null,
}: AvatarDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      el.srcObject = stream;
      // Start muted so browser autoplay policy allows playback
      el.muted = true;
      el.play()
        .then(() => {
          // Playback started — try to unmute immediately
          el.muted = false;
          setNeedsUnmute(false);
        })
        .catch(() => {
          // Autoplay allowed but audio blocked — show tap-to-unmute overlay
          setNeedsUnmute(true);
        });
    } else if (attachToElement && state.status === "connected") {
      // LiveAvatar: session.attach(el) sets srcObject internally via LiveKit.
      // Pass element already muted so LiveKit's internal play() succeeds.
      el.muted = true;
      attachToElement(el);
      // After attach, try unmuting — LiveKit will have called play() by now
      setTimeout(() => {
        if (el) {
          el.muted = false;
          setNeedsUnmute(false);
        }
      }, 500);
    }
  }, [stream, attachToElement, state.status]);

  const handleUnmute = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
      setNeedsUnmute(false);
    }
  };

  const providerLabel = PROVIDER_LABELS[provider] || provider;
  const isVisible = state.status === "connected" && (stream || attachToElement);

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-gray-900 rounded-xl overflow-hidden"
      onClick={needsUnmute ? handleUnmute : undefined}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Tap-to-unmute overlay */}
      {needsUnmute && isVisible && (
        <div className="absolute inset-0 flex items-center justify-center cursor-pointer">
          <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18l1.27 1.26L20.27 18 5.27 3 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
            <span className="text-white text-sm font-medium">Tap to unmute</span>
          </div>
        </div>
      )}

      {/* Placeholder shown when not connected */}
      {!isVisible && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
              <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            {state.status === "connecting" && (
              <>
                <div className="absolute inset-0 rounded-full border-2 border-orange-400 animate-ping opacity-75" />
                <div className="absolute inset-0 rounded-full border-2 border-orange-300 animate-ping opacity-50 delay-150" />
              </>
            )}
          </div>

          <div className="text-center">
            <p className="text-white font-semibold text-lg">{botName}</p>
            {state.status === "connecting" && (
              <p className="text-orange-300 text-sm mt-1 animate-pulse">
                {hideProvider ? "Connecting…" : `Connecting via ${providerLabel}...`}
              </p>
            )}
            {state.status === "idle" && (
              <p className="text-gray-400 text-sm mt-1">AI Avatar ready</p>
            )}
            {state.status === "error" && (
              <div className="mt-2">
                <p className="text-red-400 text-sm">{state.error || "Connection failed"}</p>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="mt-2 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-full transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Provider badge */}
      {!hideProvider && (
        <div className="absolute top-3 right-3">
          <span className="bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">
            {providerLabel}
          </span>
        </div>
      )}

      {/* Connected indicator */}
      {state.status === "connected" && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-white text-xs">Live</span>
        </div>
      )}
    </div>
  );
}
