import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { localDateStr } from "@/lib/dates";
import { getFinishedStock } from "@/lib/salesStock";
import { varianKey } from "@/lib/clientPrice";
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

  const [{ data: items }, { data: products }, { data: variants }, stock] =
    await Promise.all([
      supabase
        .from("items")
        .select("kategori")
        .eq("organization_id", organizationId)
        .eq("aktif", true),
      supabase
        .from("products")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("aktif", true),
      supabase
        .from("product_variants")
        .select("product_id, nama_varian")
        .eq("organization_id", organizationId),
      getFinishedStock(organizationId!),
    ]);

  const list = (items || []) as { kategori: string }[];

  // Perkiraan baris produk jadi harus sama dengan yang dibentuk
  // create_stock_opname_tx: master produk × varian yang aktif, ditambah
  // kombinasi yang pernah bergerak walau variannya sudah dihapus dari
  // master (barangnya masih ada di gudang).
  const produkAktif = new Set(
    ((products || []) as { id: string }[]).map((p) => p.id)
  );
  const kombinasi = new Set<string>();
  const punyaVarian = new Set<string>();
  for (const v of (variants || []) as {
    product_id: string;
    nama_varian: string;
  }[]) {
    punyaVarian.add(v.product_id);
    if (produkAktif.has(v.product_id)) {
      kombinasi.add(`${v.product_id}|${varianKey(v.nama_varian)}`);
    }
  }
  for (const id of produkAktif) {
    if (!punyaVarian.has(id)) kombinasi.add(`${id}|-`);
  }
  for (const s of stock.values()) {
    if (produkAktif.has(s.product_id)) {
      kombinasi.add(`${s.product_id}|${varianKey(s.varian)}`);
    }
  }

  const jumlah = {
    bahan: list.filter((i) => i.kategori === "Bahan Baku").length,
    kemasan: list.filter((i) => i.kategori === "Kemasan").length,
    produkJadi: kombinasi.size,
    semua: list.length + kombinasi.size,
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
        fisik di gudang · input hasil · tutup, selisihnya jadi penyesuaian.
        Cakupannya bisa bahan baku, kemasan, produk jadi, atau ketiganya.
      </p>

      <OpnameNewForm hariIni={localDateStr()} jumlah={jumlah} />
    </div>
  );
}
