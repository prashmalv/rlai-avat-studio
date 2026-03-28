"use client";

import { useParams } from "next/navigation";
import AvatarWidget from "@/components/AvatarWidget";

export default function ChatPage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <AvatarWidget mode="fullpage" botSlug={slug} />
    </div>
  );
}
