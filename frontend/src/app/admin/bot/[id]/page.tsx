/**
 * admin/bot/[id]/page.tsx — Bot editor with 5 tabs.
 *
 * Tabs:
 *  1. Avatar Setup    — provider selector + avatar grid
 *  2. Voice Setup     — provider selector + voice picker + test
 *  3. Knowledge Base  — document upload/list + knowledge prompt textarea
 *  4. Bot Settings    — name, greetings, system prompt, LLM, theme color
 *  5. Analytics       — session table + summary cards
 *
 * Layout: dark sidebar (240px) with tab list + main content area.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type Bot,
  type Document,
  type VoiceInfo,
  type Provider,
  type SessionReport,
  type SummaryReport,
} from "@/lib/api";
import AvatarCarousel, { type AvatarOption } from "@/components/admin/AvatarCarousel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "avatar" | "voice" | "knowledge" | "settings" | "analytics";

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 ${
        type === "success"
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar tab icons
// ---------------------------------------------------------------------------

const TAB_CONFIG: { id: TabId; label: string }[] = [
  { id: "avatar", label: "Avatar Setup" },
  { id: "voice", label: "Voice Setup" },
  { id: "knowledge", label: "Knowledge Base" },
  { id: "settings", label: "Bot Settings" },
  { id: "analytics", label: "Analytics" },
];

// ---------------------------------------------------------------------------
// Avatar Setup Tab
// ---------------------------------------------------------------------------

const AVATAR_PROVIDER_INFO: Record<
  string,
  { label: string; description: string; color: string }
> = {
  liveavatar: {
    label: "LiveAvatar",
    description: "HeyGen LiveAvatar — new API with Priya & Arjun.",
    color: "border-orange-500",
  },
  heygen: {
    label: "HeyGen (Legacy)",
    description: "Old HeyGen Streaming API (sunset March 2026).",
    color: "border-blue-500",
  },
  did: {
    label: "D-ID",
    description: "Animated talking portraits via WebRTC.",
    color: "border-purple-500",
  },
  simli: {
    label: "Simli",
    description: "Low-latency face animation for live AI.",
    color: "border-green-500",
  },
};

function AvatarTab({
  bot,
  onSave,
}: {
  bot: Bot;
  onSave: (updates: Partial<Bot>) => Promise<void>;
}) {
  const [selectedProvider, setSelectedProvider] = useState(bot.avatar_provider);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(bot.avatar_id || null);
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    api.getAvatarProviders().then((r) => setProviders(r.providers)).catch(() => {});
  }, []);

  const handleSaveAvatarSelection = async (avatarId: string, avatarName: string) => {
    await onSave({
      avatar_provider: selectedProvider,
      avatar_id: avatarId || null,
      avatar_name: avatarName || null,
    });
  };

  const isConfigured = (providerId: string) =>
    providers.find((p) => p.id === providerId)?.configured ?? false;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Avatar Setup</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose an avatar provider and select a specific avatar for this bot.
        </p>
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["liveavatar", "heygen", "did", "simli"] as const).map((pid) => {
          const info = AVATAR_PROVIDER_INFO[pid];
          const configured = isConfigured(pid);
          const selected = selectedProvider === pid;
          return (
            <button
              key={pid}
              onClick={() => setSelectedProvider(pid)}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                selected
                  ? `${info.color} bg-orange-50`
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {selected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div className="font-semibold text-gray-800 text-sm mb-1">{info.label}</div>
              <p className="text-xs text-gray-500">{info.description}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <div className={`w-2 h-2 rounded-full ${configured ? "bg-green-400" : "bg-red-400"}`} />
                <span className="text-xs text-gray-400">
                  {configured ? "API key set" : "Key missing"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Avatar Carousel */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Select Avatar</h3>
        <AvatarCarousel
          selectedId={selectedAvatarId}
          onSelect={(av: AvatarOption) => {
            setSelectedAvatarId(av.id);
            handleSaveAvatarSelection(av.id, av.name);
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice Setup Tab
// ---------------------------------------------------------------------------

const SARVAM_VOICES = [
  { voice_id: "meera", name: "Meera (Hindi)" },
  { voice_id: "pavithra", name: "Pavithra (Kannada)" },
  { voice_id: "maitreyi", name: "Maitreyi (Hindi)" },
  { voice_id: "arvind", name: "Arvind (Hindi)" },
  { voice_id: "amol", name: "Amol (Marathi)" },
  { voice_id: "amartya", name: "Amartya (Bengali)" },
];

function VoiceTab({
  bot,
  onSave,
}: {
  bot: Bot;
  onSave: (updates: Partial<Bot>) => Promise<void>;
}) {
  const [provider, setProvider] = useState(bot.voice_provider);
  const [voiceId, setVoiceId] = useState(bot.voice_id || "");
  const [voiceName, setVoiceName] = useState(bot.voice_name || "");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testText] = useState("Hello! I am your AI assistant. How can I help you today?");
  const [testingVoice, setTestingVoice] = useState(false);

  const loadVoices = async () => {
    setLoadingVoices(true);
    try {
      const r = await api.getVoiceList(provider);
      setVoices(r.voices);
    } catch {
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  const testVoice = async () => {
    if (!voiceId) return;
    setTestingVoice(true);
    try {
      const r = await api.synthesizeVoice(provider, voiceId, testText);
      const audio = new Audio(`data:${r.content_type};base64,${r.audio_base64}`);
      audio.play();
    } catch (err) {
      console.error("Test voice failed:", err);
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      voice_provider: provider,
      voice_id: voiceId || null,
      voice_name: voiceName || null,
    });
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Voice Setup</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose a TTS provider and voice for this bot.
        </p>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { id: "default", label: "Default", desc: "Browser-native TTS (no API key needed)" },
          { id: "elevenlabs", label: "ElevenLabs", desc: "High-quality multilingual voices" },
          { id: "sarvam", label: "Sarvam AI", desc: "Indian language voices" },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => { setProvider(opt.id); setVoices([]); setVoiceId(""); }}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              provider === opt.id
                ? "border-orange-500 bg-orange-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="font-semibold text-gray-800 text-sm mb-1">{opt.label}</div>
            <p className="text-xs text-gray-500">{opt.desc}</p>
          </button>
        ))}
      </div>

      {provider === "elevenlabs" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={loadVoices}
              disabled={loadingVoices}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loadingVoices ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : null}
              Load Voices
            </button>
          </div>
          {voices.length > 0 && (
            <select
              value={voiceId}
              onChange={(e) => {
                setVoiceId(e.target.value);
                setVoiceName(voices.find((v) => v.voice_id === e.target.value)?.name || "");
              }}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">Select a voice...</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Voice ID (manual)
            </label>
            <input
              type="text"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="Enter ElevenLabs voice ID"
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>
      )}

      {provider === "sarvam" && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Select Voice
          </label>
          <select
            value={voiceId}
            onChange={(e) => {
              setVoiceId(e.target.value);
              setVoiceName(SARVAM_VOICES.find((v) => v.voice_id === e.target.value)?.name || "");
            }}
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="">Select a voice...</option>
            {SARVAM_VOICES.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {provider !== "default" && voiceId && (
        <button
          onClick={testVoice}
          disabled={testingVoice}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {testingVoice ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          Test Voice
        </button>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
      >
        {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Save Voice Selection
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Knowledge Base Tab
// ---------------------------------------------------------------------------

const FILE_ICONS: Record<string, string> = {
  pdf: "📄",
  txt: "📝",
  md: "📋",
  json: "📦",
};

function KnowledgeTab({
  bot,
  onSave,
}: {
  bot: Bot;
  onSave: (updates: Partial<Bot>) => Promise<void>;
}) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [knowledgePrompt, setKnowledgePrompt] = useState(bot.knowledge_prompt || "");
  const [isSaving, setIsSaving] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; text: string } | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [autoGenStatus, setAutoGenStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const r = await api.getBotDocuments(bot.id);
      setDocs(r.documents);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [bot.id]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadDocument(bot.id, file);
      await loadDocs();
      // Auto-generate system prompt from uploaded documents
      setGeneratingPrompt(true);
      setAutoGenStatus("PDF se system prompt generate ho raha hai...");
      try {
        const suggestions = await api.generateSuggestions(bot.id);
        if (suggestions.system_prompt) {
          await onSave({ system_prompt: suggestions.system_prompt });
        }
        if (suggestions.faqs?.length > 0) {
          const faqText = suggestions.faqs
            .map((f: { q: string; a: string }) => `Q: ${f.q}\nA: ${f.a}`)
            .join("\n\n");
          setKnowledgePrompt(faqText);
          await onSave({ knowledge_prompt: faqText });
        }
        setAutoGenStatus("System prompt + FAQs auto-generate ho gaye!");
        setTimeout(() => setAutoGenStatus(null), 4000);
      } catch {
        setAutoGenStatus(null);
      } finally {
        setGeneratingPrompt(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleToggle = async (docId: string) => {
    try {
      const updated = await api.toggleDocument(bot.id, docId);
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, is_active: updated.is_active } : d)));
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleDelete = async (docId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.deleteDocument(bot.id, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handlePreview = async (docId: string) => {
    try {
      const r = await api.previewDocument(bot.id, docId);
      setPreviewDoc({ name: r.original_name, text: r.preview });
    } catch {
      alert("Preview failed");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({ knowledge_prompt: knowledgePrompt || null });
    setIsSaving(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Knowledge Base</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload documents and add direct knowledge text for this bot.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Documents */}
        <div className="space-y-4">
          <h3 className="font-medium text-gray-700">Documents</h3>

          {/* Upload area */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && fileInputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInputRef.current.files = dt.files;
                fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.md,.txt,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-600">
                  Drop file here or <span className="text-orange-500 font-medium">browse</span>
                </p>
                <p className="text-xs text-gray-400">PDF, MD, TXT, JSON</p>
              </div>
            )}
          </div>

          {generatingPrompt && (
            <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
              <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              {autoGenStatus}
            </div>
          )}
          {!generatingPrompt && autoGenStatus && (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
              <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              {autoGenStatus}
            </div>
          )}
          <p className="text-xs text-gray-400">
            Only active documents are included in the AI's context.
          </p>

          {/* Document list */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <span className="text-lg">{FILE_ICONS[doc.file_type] ?? "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{doc.original_name}</p>
                    <p className="text-xs text-gray-400">{formatSize(doc.file_size)}</p>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(doc.id)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      doc.is_active ? "bg-orange-500" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        doc.is_active ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  {/* Preview */}
                  <button
                    onClick={() => handlePreview(doc.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                    title="Preview"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(doc.id, doc.original_name)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Knowledge Prompt */}
        <div className="space-y-4">
          <h3 className="font-medium text-gray-700">Direct Knowledge Text</h3>
          <p className="text-xs text-gray-500">
            Type or paste knowledge directly. This is always included in the AI's context, in
            addition to active documents.
          </p>
          <div className="relative">
            <textarea
              value={knowledgePrompt}
              onChange={(e) => setKnowledgePrompt(e.target.value)}
              rows={14}
              placeholder={`Enter product information, FAQs, or any knowledge you want the bot to have...\n\nExample:\n- Product name: Skoda Kushaq\n- Price range: ₹10.89 – 18.89 lakh\n- Available colors: Tornado Red, Carbon Steel, etc.`}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-white"
              style={{ minHeight: "300px" }}
            />
            <div className="absolute bottom-3 right-3 text-xs text-gray-400">
              {knowledgePrompt.length.toLocaleString()} chars
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Save Knowledge Base
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">{previewDoc.name}</h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 max-h-80 overflow-y-auto">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{previewDoc.text}</pre>
            </div>
            <div className="px-6 py-3 bg-gray-50 text-xs text-gray-400 border-t border-gray-100">
              Showing first 500 characters
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bot Settings Tab
// ---------------------------------------------------------------------------

const LLM_PROVIDERS = [
  { id: "ollama", label: "Ollama (local)" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "bedrock", label: "AWS Bedrock" },
];

function SettingsTab({
  bot,
  onSave,
}: {
  bot: Bot;
  onSave: (updates: Partial<Bot>) => Promise<void>;
}) {
  const [botName, setBotName] = useState(bot.bot_name);
  const [greetingEn, setGreetingEn] = useState(bot.greeting_en);
  const [greetingHi, setGreetingHi] = useState(bot.greeting_hi);
  const [systemPrompt, setSystemPrompt] = useState(bot.system_prompt || "");
  const [themeColor, setThemeColor] = useState(bot.theme_color);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      bot_name: botName,
      greeting_en: greetingEn,
      greeting_hi: greetingHi,
      system_prompt: systemPrompt || null,
      theme_color: themeColor,
    });
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Bot Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure your bot&apos;s persona and language model settings.
        </p>
      </div>

      {/* Bot Display Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Bot Display Name</label>
        <input
          type="text"
          value={botName}
          onChange={(e) => setBotName(e.target.value)}
          className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Avtar"
        />
      </div>

      {/* Greeting (English) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Greeting (English)</label>
        <input
          type="text"
          value={greetingEn}
          onChange={(e) => setGreetingEn(e.target.value)}
          className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {/* Greeting (Hindi) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Greeting (Hindi)</label>
        <input
          type="text"
          value={greetingHi}
          onChange={(e) => setGreetingHi(e.target.value)}
          className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {/* System Prompt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          System Prompt
          <span className="ml-1 text-xs text-gray-400 font-normal">(leave blank for default)</span>
        </label>
        <textarea
          rows={6}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful AI assistant for [company]. You help customers with..."
          className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
        />
      </div>

      {/* Theme Color */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Theme Color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
          />
          <input
            type="text"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <div
            className="w-8 h-8 rounded-full border border-gray-200"
            style={{ background: themeColor }}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
      >
        {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Save Settings
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics Tab
// ---------------------------------------------------------------------------

function SentimentBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    positive: "bg-green-100 text-green-700",
    neutral: "bg-gray-100 text-gray-600",
    negative: "bg-red-100 text-red-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[value] || map.neutral}`}>
      {value}
    </span>
  );
}

function AnalyticsTab({ botId }: { botId: string }) {
  const [reports, setReports] = useState<SessionReport[]>([]);
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        api.getReports(botId, 50, 0),
        api.getSummaryReport(botId),
      ]);
      setReports(r.sessions);
      setSummary(s);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    load();
  }, [load]);

  const fmtDur = (s: number | null) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const exportCsv = () => {
    const rows = [
      ["session_id", "started_at", "duration", "channel", "sentiment", "lead_score", "intent"].join(","),
      ...reports.map((r) => {
        const a = r.analytics as Record<string, unknown>;
        return [
          r.session_id,
          r.started_at || "",
          r.duration_seconds || "",
          r.channel,
          String(a?.sentiment || ""),
          String(a?.lead_score || ""),
          String(a?.intent || ""),
        ].join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bot-${botId}-sessions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Analytics</h2>
          <p className="text-sm text-gray-500 mt-0.5">Session statistics for this bot.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-sm text-orange-500 hover:text-orange-600">
            Refresh
          </button>
          {reports.length > 0 && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500">Total Sessions</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{summary.total_sessions}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500">Avg Lead Score</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">{summary.avg_lead_score}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500">Positive</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {summary.sentiment_breakdown?.positive || 0}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500">Top Topics</p>
            <p className="text-sm text-gray-700 mt-1 truncate">
              {summary.top_topics.slice(0, 2).join(", ") || "—"}
            </p>
          </div>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No sessions recorded for this bot yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Session", "Started", "Duration", "Channel", "Sentiment", "Lead", "Intent"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const a = r.analytics as Record<string, unknown>;
                  return (
                    <tr key={r.session_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {r.session_id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmtDate(r.started_at)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtDur(r.duration_seconds)}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{r.channel}</td>
                      <td className="px-4 py-3">
                        {a?.sentiment ? (
                          <SentimentBadge value={String(a.sentiment)} />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a?.lead_score != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-orange-400 rounded-full"
                                style={{ width: `${Number(a.lead_score)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{String(a.lead_score)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 capitalize text-xs">
                        {String(a?.intent || "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main bot editor page
// ---------------------------------------------------------------------------

export default function BotEditorPage() {
  const params = useParams();
  const router = useRouter();
  const botId = params.id as string;

  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("avatar");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadBot = useCallback(async () => {
    try {
      const b = await api.getBot(botId);
      setBot(b);
    } catch {
      router.push("/admin");
    } finally {
      setLoading(false);
    }
  }, [botId, router]);

  useEffect(() => {
    loadBot();
  }, [loadBot]);

  const handleSave = async (updates: Partial<Bot>) => {
    try {
      const updated = await api.updateBot(botId, updates);
      setBot(updated);
      showToast("Saved successfully");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    }
  };

  if (loading || !bot) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const publicUrl = `/chat/${bot.slug}`;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 text-white flex flex-col">
        {/* Back + bot name */}
        <div className="px-4 py-4 border-b border-gray-800">
          <button
            onClick={() => router.push("/admin")}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Bots
          </button>
          <p className="font-semibold text-white text-sm truncate">{bot.name}</p>
          <p className="text-xs text-gray-400 font-mono mt-0.5">/{bot.slug}</p>
        </div>

        {/* Tabs */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-orange-500 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* View bot */}
        <div className="px-4 py-4 border-t border-gray-800">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Bot
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <h1 className="font-semibold text-gray-800">
            {TAB_CONFIG.find((t) => t.id === activeTab)?.label}
          </h1>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-mono">{bot.slug}</span>
          </div>
        </header>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === "avatar" && <AvatarTab bot={bot} onSave={handleSave} />}
          {activeTab === "voice" && <VoiceTab bot={bot} onSave={handleSave} />}
          {activeTab === "knowledge" && <KnowledgeTab bot={bot} onSave={handleSave} />}
          {activeTab === "settings" && <SettingsTab bot={bot} onSave={handleSave} />}
          {activeTab === "analytics" && <AnalyticsTab botId={bot.id} />}
        </div>
      </main>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
