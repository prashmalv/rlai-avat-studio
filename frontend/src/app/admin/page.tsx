/**
 * admin/page.tsx — Bot list dashboard.
 *
 * Shows all bots in a responsive grid. Each bot card has:
 *  - Bot name + slug
 *  - Avatar provider badge
 *  - Active document count
 *  - Status badge
 *  - Edit / Open Widget / Copy URL / Delete actions
 *
 * Empty state when no bots exist.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, authStorage, type Bot } from "@/lib/api";

const PUBLIC_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

const PROVIDER_BADGE: Record<string, { label: string; color: string }> = {
  heygen: { label: "HeyGen", color: "bg-blue-100 text-blue-700" },
  did: { label: "D-ID", color: "bg-purple-100 text-purple-700" },
  simli: { label: "Simli", color: "bg-green-100 text-green-700" },
};

function ProviderBadge({ provider }: { provider: string }) {
  const info = PROVIDER_BADGE[provider] ?? {
    label: provider,
    color: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadBots = useCallback(async () => {
    try {
      const data = await api.listBots();
      setBots(data.bots);
    } catch (err) {
      console.error("Failed to load bots:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  const handleDelete = async (bot: Bot) => {
    if (!window.confirm(`Delete "${bot.name}"? This cannot be undone.`)) return;
    setDeletingId(bot.id);
    try {
      await api.deleteBot(bot.id);
      setBots((prev) => prev.filter((b) => b.id !== bot.id));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete bot.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyUrl = (bot: Bot) => {
    const url = `${PUBLIC_BASE}/chat/${bot.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(bot.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">RLAI Avatar Studios</h1>
              <p className="text-xs text-gray-400">Admin Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/admin/bot/new")}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Bot
            </button>
            <button
              onClick={() => { authStorage.clearToken(); router.push("/admin/login"); }}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : bots.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No bots yet</h2>
            <p className="text-gray-400 text-sm mb-6">
              Create your first bot to get a public chat URL.
            </p>
            <button
              onClick={() => router.push("/admin/bot/new")}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create your first bot
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">
                {bots.length} {bots.length === 1 ? "Bot" : "Bots"}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {bots.map((bot) => (
                <div
                  key={bot.id}
                  className="bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-all overflow-hidden"
                >
                  {/* Card header */}
                  <div className="px-5 py-4 border-b border-gray-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-white text-base truncate">
                          {bot.name}
                        </h3>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          /{bot.slug}
                        </p>
                      </div>
                      <StatusBadge active={bot.is_active} />
                    </div>
                    {bot.description && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                        {bot.description}
                      </p>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="px-5 py-3 flex items-center gap-3">
                    <ProviderBadge provider={bot.avatar_provider} />
                    <span className="text-xs text-gray-400">
                      {bot.doc_count} active doc{bot.doc_count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="px-5 pb-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/admin/bot/${bot.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>

                    <a
                      href={`/chat/${bot.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open Widget
                    </a>

                    <button
                      onClick={() => handleCopyUrl(bot)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg transition-colors"
                    >
                      {copiedId === bot.id ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-green-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy URL
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDelete(bot)}
                      disabled={deletingId === bot.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-400 hover:text-red-300 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deletingId === bot.id ? (
                        <div className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-3 text-xs text-gray-500 border-t border-gray-800">
        Developed and owned by{" "}
        <a href="https://rightleft.ai" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 font-medium">RLAI</a>
        {" · "}rightleft.ai
      </footer>
    </div>
  );
}
