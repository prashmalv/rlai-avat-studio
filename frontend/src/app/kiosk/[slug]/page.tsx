"use client";

import { useParams } from "next/navigation";
import AvatarWidget from "@/components/AvatarWidget";

export default function KioskPage() {
  const params = useParams();
  const slug = params.slug as string;

  return <AvatarWidget mode="kiosk" botSlug={slug} />;
}
