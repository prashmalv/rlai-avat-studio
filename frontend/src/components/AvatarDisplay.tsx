/**
 * AvatarDisplay.tsx — Renders the live avatar video stream.
 *
 * Handles three states:
 *  1. idle / connecting — animated placeholder with provider name
 *  2. connected         — <video> element fed by the MediaStream
 *  3. error             — error message with retry button
 *
 * The component is intentionally display-only; all connection logic lives in
 * useAvatar. The parent passes `stream` and `status` as props.
 */

"use client";

import { useEffect, useRef } from "react";
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

  // Attach stream (old providers) or call attachToElement (LiveAvatar)
  useEffect(() => {
    if (!videoRef.current) return;
    if (stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    } else if (attachToElement) {
      // LiveAvatar: attach as soon as the ref is available — the SDK buffers
      // the video/audio track and plays it once the LiveKit room is ready.
      // Do NOT wait for status="connected" since that now fires after WebSocket ready.
      attachToElement(videoRef.current);
    }
  }, [stream, attachToElement]);

  const providerLabel = PROVIDER_LABELS[provider] || provider;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-900 rounded-xl overflow-hidden">
      {/* Video — always rendered, hidden when no stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          state.status === "connected" && (stream || attachToElement) ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Placeholder shown when not connected */}
      {(state.status !== "connected" || (!stream && !attachToElement)) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          {/* Animated avatar silhouette */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
              <svg
                className="w-14 h-14 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>

            {/* Connecting pulsing ring */}
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
                {hideProvider ? "Connecting\u2026" : `Connecting via ${providerLabel}...`}
              </p>
            )}
            {state.status === "idle" && (
              <p className="text-gray-400 text-sm mt-1">
                AI Avatar ready
              </p>
            )}
            {state.status === "error" && (
              <div className="mt-2">
                <p className="text-red-400 text-sm">
                  {state.error || "Connection failed"}
                </p>
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
