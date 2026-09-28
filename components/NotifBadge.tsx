"use client";

/* ============================================================
   Badge jumlah notifikasi di menu Notifications.

   Dua bentuk, karena menunya tampil dalam dua lebar:
   - `NotifPill`: angka di ujung kanan baris menu (sidebar lebar,
     drawer HP);
   - `NotifTitik`: titik di pojok ikon (sidebar rail, bar bawah HP),
     tempat yang tidak punya ruang untuk angka.

   Merah kalau ada yang kritis, kuning kalau cuma peringatan. Nol
   atau belum termuat: tidak merender apa pun. Badge "0" cuma
   mengajari orang untuk berhenti melihat badge-nya.
   ============================================================ */

import { useSyncExternalStore } from "react";
import {
  langganan,
  snapshot,
  snapshotServer,
  teksBadge,
} from "@/lib/notifBadge";

function useNotifBadge() {
  return useSyncExternalStore(langganan, snapshot, snapshotServer);
}

export function NotifPill({ className = "" }: { className?: string }) {
  const b = useNotifBadge();
  if (!b || b.total === 0) return null;
  return (
    <span
      aria-label={`${b.total} notifikasi`}
      className={`ml-auto shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-semibold leading-5 text-center tabular-nums ${
        b.kritis ? "bg-clay-500 text-white" : "bg-amber-500 text-ink"
      } ${className}`}
    >
      {teksBadge(b)}
    </span>
  );
}

export function NotifTitik({ className = "" }: { className?: string }) {
  const b = useNotifBadge();
  if (!b || b.total === 0) return null;
  return (
    <span
      aria-label={`${b.total} notifikasi`}
      className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ${
        b.kritis ? "bg-clay-500" : "bg-amber-500"
      } ${className}`}
    />
  );
}
