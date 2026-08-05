import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { localDateStr } from "@/lib/dates";
import OpnameNewForm from "./OpnameNewForm";

export default async function OpnameBaruPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  // Satu opname berjalan pada satu waktu — RPC menolaknya juga, tapi lebih
  // baik user langsung dibawa ke opname yang belum selesai daripada mengisi
  // form yang pasti ditolak.
  const { data: berjalan } = await supabase
    .from("stock_opnames")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "Berjalan")
    .maybeSingle();

  if (berjalan) redirect(`/stock-opname/${berjalan.id}`);

  const { data: items } = await supabase
    .from("items")
    .select("kategori")
    .eq("organization_id", organizationId)
    .eq("aktif", true);

  const list = (items || []) as { kategori: string }[];
  const jumlah = {
    semua: list.length,
    bahan: list.filter((i) => i.kategori === "Bahan Baku").length,
    kemasan: list.filter((i) => i.kategori === "Kemasan").length,
  };

  return (
    <div className="max-w-5xl">
      <Link
        href="/stock-opname"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Stock Opname
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Opname Baru
      </h1>
      <p className="text-muted text-sm mb-6">
        Alurnya: buka opname (stok dipotret) · cetak lembar hitung · hitung
        fisik di gudang · input hasil · tutup, selisihnya jadi adjustment.
      </p>

      <OpnameNewForm hariIni={localDateStr()} jumlah={jumlah} />
    </div>
  );
}
