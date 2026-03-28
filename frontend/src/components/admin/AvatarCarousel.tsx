"use client";

import { useState } from "react";

export interface AvatarOption {
  id: string;           // HeyGen avatar ID / name
  name: string;         // Display name
  origin: string;       // Demographic label e.g. "India", "Japan"
  gender: "M" | "F";
  bgColor: string;      // Hex color for placeholder gradient
  skinTone: string;     // emoji skin-tone approximation for the placeholder icon
}

// LiveAvatar avatars — UUIDs from app.liveavatar.com (verified working)
const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "bf00036b-558a-44b5-b2ff-1e3cec0f4ceb", name: "Priya",   origin: "India", gender: "F", bgColor: "#f59e0b", skinTone: "\uD83D\uDC69\uD83C\uDFFE" },
  { id: "7a517e8e-b41f-49e7-b6b3-2cdfb4bbff1e", name: "Arjun",   origin: "India", gender: "M", bgColor: "#d97706", skinTone: "\uD83D\uDC68\uD83C\uDFFE" },
];

interface AvatarCarouselProps {
  selectedId: string | null;
  onSelect: (avatar: AvatarOption) => void;
}

export default function AvatarCarousel({ selectedId, onSelect }: AvatarCarouselProps) {
  const [page, setPage] = useState(0);
  const PER_PAGE = 4;
  const total = AVATAR_OPTIONS.length;
  const maxPage = Math.ceil(total / PER_PAGE) - 1;

  const visible = AVATAR_OPTIONS.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <div>
      <div className="flex items-center gap-3">
        {/* Prev */}
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Cards */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 overflow-hidden">
          {visible.map((av) => {
            const isSelected = selectedId === av.id;
            return (
              <button
                key={av.id}
                onClick={() => onSelect(av)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 group ${
                  isSelected
                    ? "border-orange-500 bg-orange-50 shadow-md shadow-orange-100"
                    : "border-gray-200 bg-white hover:border-orange-300 hover:shadow-md"
                }`}
              >
                {/* Avatar illustration */}
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-inner"
                  style={{ background: `linear-gradient(135deg, ${av.bgColor}33, ${av.bgColor}88)` }}
                >
                  {av.skinTone}
                </div>

                {/* Selected ring */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </div>
                )}

                <div className="text-center">
                  <p className={`text-sm font-semibold leading-tight ${isSelected ? "text-orange-700" : "text-gray-800"}`}>
                    {av.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{av.origin}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                    av.gender === "F" ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600"
                  }`}>
                    {av.gender === "F" ? "Female" : "Male"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Next */}
        <button
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          disabled={page >= maxPage}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-3">
        {Array.from({ length: maxPage + 1 }).map((_, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i === page ? "bg-orange-500 w-4" : "bg-gray-300"
            }`}
          />
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-2">
        {total} avatars available &middot; Click to select
      </p>
    </div>
  );
}
