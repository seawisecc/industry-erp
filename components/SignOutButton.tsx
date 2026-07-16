"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

export default function SignOutButton({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "solid" | "icon";
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
