"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

export default function SignOutButton({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "solid" | "icon";
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    if (loading) return; // guard: cegah double-click
    setLoading(true);
    await supabase.auth.signOut();
    // Hard navigation: buang seluruh cache router sesi ini
    window.location.assign("/login");
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleSignOut}
        title="Keluar"
        className="flex justify-center text-white/50 hover:text-white p-2 transition-colors"
      >
        <LogOut size={17} />
      </button>
    );
  }

  if (variant === "solid") {
    return (
      <button
        onClick={handleSignOut}
        className="inline-flex items-center gap-2 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors"
      >
        <LogOut size={15} /> Keluar
      </button>
    );
  }

  return (
    <button
      onClick={handleSignOut}
      title="Keluar"
      className="flex items-center gap-2 text-white/50 hover:text-white text-[12px] mt-2 transition-colors"
    >
      <LogOut size={14} /> Keluar
    </button>
  );
}
