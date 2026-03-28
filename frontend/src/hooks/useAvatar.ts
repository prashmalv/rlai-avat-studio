/**
 * useAvatar.ts — Unified multi-provider avatar hook.
 *
 * Abstracts over three streaming avatar providers:
 *
 *   heygen — Uses @heygen/streaming-avatar npm SDK. The backend proxies
 *            token generation. The SDK handles WebRTC internally.
 *
 *   did    — Uses the D-ID Talks Streams API via the backend proxy.
 *            Manages a full WebRTC PeerConnection in this hook:
 *            1. POST /api/avatars/did/session  → get ICE servers + SDP offer
 *            2. Create RTCPeerConnection, set remote description (offer)
 *            3. Gather local ICE candidates, send each to backend
 *            4. Create SDP answer, set local description, send to backend
 *            5. On ICE connection state = "connected", mark as connected
 *            Remote video track is exposed via the `stream` state.
 *
 *   simli  — Uses simli-client npm SDK. The backend proxies token generation.
 *
 * Public API:
 *   connect()    → initialise the session and return true on success
 *   speak(text)  → send text to the avatar to speak
 *   disconnect() → cleanly terminate the session
 *   state        → { status: "idle"|"connecting"|"connected"|"error", error? }
 *   stream       → MediaStream | null (attach to <video> element)
 */

"use client";

import { useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

export type AvatarProvider = "heygen" | "did" | "simli" | "liveavatar";

export interface AvatarState {
  status: "idle" | "connecting" | "connected" | "error";
  error?: string;
}

export interface UseAvatarReturn {
  state: AvatarState;
  stream: MediaStream | null;
  connect: () => Promise<boolean>;
  speak: (text: string, voiceId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** For LiveAvatar: call this with the <video> element after mount */
  attachToElement: ((el: HTMLMediaElement) => void) | null;
}

export function useAvatar(
  provider: AvatarProvider,
  avatarId?: string | null
): UseAvatarReturn {
  const [state, setState] = useState<AvatarState>({ status: "idle" });
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Provider-specific session refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heygenAvatarRef = useRef<any>(null);
  const didPeerRef = useRef<RTCPeerConnection | null>(null);
  const didStreamIdRef = useRef<string | null>(null);
  const didSessionIdRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simliClientRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveAvatarSessionRef = useRef<any>(null);

  // -------------------------------------------------------------------------
  // HeyGen
  // -------------------------------------------------------------------------

  const connectHeygen = useCallback(async (): Promise<boolean> => {
    try {
      setState({ status: "connecting" });
      const heygenModule = await import("@heygen/streaming-avatar");
      // SDK exports StreamingAvatar as default, helpers as named exports
      const StreamingAvatar = heygenModule.default as new (opts: { token: string }) => typeof heygenModule.default.prototype;
      const { StreamingEvents, AvatarQuality } = heygenModule;

      const tokenResp = await api.getHeyGenToken();
      const avatar = new StreamingAvatar({ token: tokenResp.token });
      heygenAvatarRef.current = avatar;

      // Wait for STREAM_READY before resolving — must register listener BEFORE createStartAvatar
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("HeyGen stream timeout after 20s")),
          20000
        );

        avatar.on(StreamingEvents.STREAM_READY, (event: { detail: MediaStream }) => {
          clearTimeout(timeout);
          setStream(event.detail);
          setState({ status: "connected" });
          resolve();
        });

        avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
          setState({ status: "idle" });
          setStream(null);
        });

        avatar
          .createStartAvatar({
            avatarName: avatarId || "Anna_public_3_20240108",
            quality: AvatarQuality.Medium,
          })
          .catch((err: unknown) => {
            clearTimeout(timeout);
            reject(err);
          });
      });

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "HeyGen connection failed";
      setState({ status: "error", error: msg });
      return false;
    }
  }, [avatarId]);

  const speakHeygen = useCallback(async (text: string): Promise<void> => {
    if (!heygenAvatarRef.current) return;
    try {
      await heygenAvatarRef.current.speak({ text, taskType: "talk" });
    } catch (err) {
      console.error("HeyGen speak failed:", err);
    }
  }, []);

  const disconnectHeygen = useCallback(async (): Promise<void> => {
    if (heygenAvatarRef.current) {
      try {
        await heygenAvatarRef.current.stopAvatar();
      } catch {
        // ignore
      }
      heygenAvatarRef.current = null;
    }
    setStream(null);
    setState({ status: "idle" });
  }, []);

  // -------------------------------------------------------------------------
  // D-ID WebRTC
  // -------------------------------------------------------------------------

  const connectDID = useCallback(async (): Promise<boolean> => {
    try {
      setState({ status: "connecting" });

      // 1. Create D-ID streaming session
      const sessionData = await api.createDIDSession(avatarId || "") as {
        id: string;
        session_id: string;
        ice_servers: RTCIceServer[];
        offer: RTCSessionDescriptionInit;
      };

      const streamId = sessionData.id;
      const sessionId = sessionData.session_id;
      didStreamIdRef.current = streamId;
      didSessionIdRef.current = sessionId;

      // 2. Create RTCPeerConnection with ICE servers from D-ID
      const pc = new RTCPeerConnection({
        iceServers: sessionData.ice_servers || [
          { urls: "stun:stun.l.google.com:19302" },
        ],
      });
      didPeerRef.current = pc;

      // 3. Handle incoming remote video/audio tracks
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setStream(event.streams[0]);
        }
      };

      // 4. Send ICE candidates to backend as they are gathered
      pc.onicecandidate = async (event) => {
        if (event.candidate && streamId && sessionId) {
          try {
            await api.sendDIDICE(streamId, sessionId, event.candidate.toJSON());
          } catch (err) {
            console.warn("ICE candidate send failed:", err);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        if (iceState === "connected" || iceState === "completed") {
          setState({ status: "connected" });
        } else if (iceState === "failed" || iceState === "disconnected") {
          setState({ status: "error", error: `ICE ${iceState}` });
        }
      };

      // 5. Set the remote SDP offer from D-ID
      await pc.setRemoteDescription(
        new RTCSessionDescription(sessionData.offer)
      );

      // 6. Create and set local SDP answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 7. Send the SDP answer to D-ID via backend proxy
      await api.sendDIDSDP(streamId, sessionId, answer);

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "D-ID connection failed";
      setState({ status: "error", error: msg });
      return false;
    }
  }, [avatarId]);

  const speakDID = useCallback(
    async (text: string, voiceId?: string): Promise<void> => {
      const streamId = didStreamIdRef.current;
      const sessionId = didSessionIdRef.current;
      if (!streamId || !sessionId) return;
      try {
        await api.didSpeak(streamId, sessionId, text, voiceId);
      } catch (err) {
        console.error("D-ID speak failed:", err);
      }
    },
    []
  );

  const disconnectDID = useCallback(async (): Promise<void> => {
    const streamId = didStreamIdRef.current;
    const sessionId = didSessionIdRef.current;
    if (streamId && sessionId) {
      try {
        await api.closeDIDSession(streamId, sessionId);
      } catch {
        // ignore
      }
    }
    if (didPeerRef.current) {
      didPeerRef.current.close();
      didPeerRef.current = null;
    }
    didStreamIdRef.current = null;
    didSessionIdRef.current = null;
    setStream(null);
    setState({ status: "idle" });
  }, []);

  // -------------------------------------------------------------------------
  // Simli
  // -------------------------------------------------------------------------

  const connectSimli = useCallback(async (): Promise<boolean> => {
    try {
      setState({ status: "connecting" });

      if (!avatarId) {
        throw new Error("Simli requires a face_id (avatar ID).");
      }

      const tokenData = await api.getSimliToken(avatarId);
      const sessionToken = (tokenData as Record<string, string>).token || (tokenData as Record<string, string>).session_token || "";

      const { SimliClient } = await import("simli-client");

      const videoEl = document.createElement("video");
      const audioEl = document.createElement("audio");

      // SimliClient(session_token, videoEl, audioEl, iceServers?)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (SimliClient as any)(sessionToken, videoEl, audioEl);
      simliClientRef.current = client;

      await client.start();

      // Expose the video stream
      if (videoEl && videoEl.srcObject instanceof MediaStream) {
        setStream(videoEl.srcObject);
      }

      setState({ status: "connected" });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Simli connection failed";
      setState({ status: "error", error: msg });
      return false;
    }
  }, [avatarId]);

  const speakSimli = useCallback(async (text: string): Promise<void> => {
    if (!simliClientRef.current) return;
    try {
      // Simli works with audio — synthesize via backend then send PCM
      // For text input, use sendAudioData if available or TTS
      if (typeof simliClientRef.current.sendTextData === "function") {
        await simliClientRef.current.sendTextData(text);
      }
    } catch (err) {
      console.error("Simli speak failed:", err);
    }
  }, []);

  const disconnectSimli = useCallback(async (): Promise<void> => {
    if (simliClientRef.current) {
      try {
        simliClientRef.current.close();
      } catch {
        // ignore
      }
      simliClientRef.current = null;
    }
    setStream(null);
    setState({ status: "idle" });
  }, []);

  // -------------------------------------------------------------------------
  // LiveAvatar (HeyGen LiveAvatar SDK)
  // -------------------------------------------------------------------------

  const connectLiveAvatar = useCallback(async (): Promise<boolean> => {
    try {
      setState({ status: "connecting" });
      const { LiveAvatarSession, SessionEvent } = await import("@heygen/liveavatar-web-sdk");
      const tokenResp = await api.getLiveAvatarToken(avatarId || "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb");
      const session = new LiveAvatarSession(tokenResp.session_token, {});
      liveAvatarSessionRef.current = session;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("LiveAvatar stream timeout after 30s")), 30000);
        session.on(SessionEvent.SESSION_STREAM_READY, () => {
          clearTimeout(timeout);
          setState({ status: "connected" });
          resolve();
        });
        session.on(SessionEvent.SESSION_DISCONNECTED, () => {
          setState({ status: "idle" });
        });
        session.start().catch((err: unknown) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "LiveAvatar connection failed";
      setState({ status: "error", error: msg });
      return false;
    }
  }, [avatarId]);

  const speakLiveAvatar = useCallback(async (text: string): Promise<void> => {
    if (!liveAvatarSessionRef.current) return;
    try {
      liveAvatarSessionRef.current.message(text);
    } catch (err) {
      console.error("LiveAvatar speak failed:", err);
    }
  }, []);

  const disconnectLiveAvatar = useCallback(async (): Promise<void> => {
    if (liveAvatarSessionRef.current) {
      try {
        await liveAvatarSessionRef.current.stop();
      } catch { /* ignore */ }
      liveAvatarSessionRef.current = null;
    }
    setStream(null);
    setState({ status: "idle" });
  }, []);

  const attachLiveAvatar = useCallback((el: HTMLMediaElement): void => {
    if (liveAvatarSessionRef.current) {
      liveAvatarSessionRef.current.attach(el);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Unified interface
  // -------------------------------------------------------------------------

  const connect = useCallback(async (): Promise<boolean> => {
    if (provider === "heygen") return connectHeygen();
    if (provider === "did") return connectDID();
    if (provider === "simli") return connectSimli();
    if (provider === "liveavatar") return connectLiveAvatar();
    setState({ status: "error", error: `Unknown provider: ${provider}` });
    return false;
  }, [provider, connectHeygen, connectDID, connectSimli, connectLiveAvatar]);

  const speak = useCallback(
    async (text: string, voiceId?: string): Promise<void> => {
      if (provider === "heygen") return speakHeygen(text);
      if (provider === "did") return speakDID(text, voiceId);
      if (provider === "simli") return speakSimli(text);
      if (provider === "liveavatar") return speakLiveAvatar(text);
    },
    [provider, speakHeygen, speakDID, speakSimli, speakLiveAvatar]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (provider === "heygen") return disconnectHeygen();
    if (provider === "did") return disconnectDID();
    if (provider === "simli") return disconnectSimli();
    if (provider === "liveavatar") return disconnectLiveAvatar();
  }, [provider, disconnectHeygen, disconnectDID, disconnectSimli, disconnectLiveAvatar]);

  return {
    state,
    stream,
    connect,
    speak,
    disconnect,
    attachToElement: provider === "liveavatar" ? attachLiveAvatar : null,
  };
}
