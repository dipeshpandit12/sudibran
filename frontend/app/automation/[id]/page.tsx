"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyServiceRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect legacy individual app links directly to the unified autonomous AI agent console
    router.replace("/automation");
  }, [router]);

  return (
    <div className="min-h-screen bg-white text-black flex items-center justify-center">
      <div className="flex items-center gap-3 font-mono text-sm">
        <span className="size-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
        <span>Redirecting to Unified Autonomous AI Agent...</span>
      </div>
    </div>
  );
}
