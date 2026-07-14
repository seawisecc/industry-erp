"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const IDLE_MINUTES = 30;

/**
 * Auto sign-out setelah tidak ada aktivitas selama IDLE_MINUTES.
 * Aktivitas = klik, ketik, scroll, sentuh, gerak mouse.
 */
export default function IdleLogout() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function reset() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        await supabase.auth.signOut();
        router.replace("/login");
        router.refresh();
      }, IDLE_MINUTES * 60 * 1000);
    }

    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [router]);

  return null;
}
