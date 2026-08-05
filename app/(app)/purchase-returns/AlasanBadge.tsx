import { ALASAN_TONE, type AlasanRetur } from "@/lib/purchaseReturn";

/** Pil alasan retur, dipakai di daftar dan detail. */
export default function AlasanBadge({ alasan }: { alasan: string }) {
  const tone = ALASAN_TONE[alasan as AlasanRetur] ?? "bg-white/70 text-muted";
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${tone}`}
    >
      {alasan}
    </span>
  );
}
