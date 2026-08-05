import { TUJUAN_TONE, type TujuanPemakaian } from "@/lib/materialIssue";

/** Pil kategori tujuan, dipakai di daftar dan detail pemakaian bahan. */
export default function TujuanBadge({ tujuan }: { tujuan: string }) {
  const tone = TUJUAN_TONE[tujuan as TujuanPemakaian] ?? "bg-white/70 text-muted";
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${tone}`}
    >
      {tujuan}
    </span>
  );
}
