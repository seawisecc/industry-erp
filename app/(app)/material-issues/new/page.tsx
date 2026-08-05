import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { localDateStr } from "@/lib/dates";
import MaterialIssueForm, { IssueItem } from "../MaterialIssueForm";

type ItemRaw = { id: string; kode: string; nama: string; satuan: string };
type BatchRaw = { item_id: string; qty_sisa: number; harga_per_unit: number };

export default async function NewMaterialIssuePage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: items }, { data: batches }] = await Promise.all([
    supabase
      .from("items")
      .select("id, kode, nama, satuan")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode"),
    supabase
      .from("purchase_batches")
      .select("item_id, qty_sisa, harga_per_unit")
      .eq("organization_id", organizationId)
      .gt("qty_sisa", 0)
      .order("created_at", { ascending: false }),
  ]);

  const stok = new Map<string, number>();
  const lastHarga = new Map<string, number>();
  for (const b of (batches || []) as BatchRaw[]) {
    stok.set(b.item_id, (stok.get(b.item_id) || 0) + Number(b.qty_sisa));
    if (!lastHarga.has(b.item_id)) lastHarga.set(b.item_id, Number(b.harga_per_unit));
  }

  const issueItems: IssueItem[] = ((items || []) as ItemRaw[]).map((it) => ({
    id: it.id,
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    stok: stok.get(it.id) || 0,
    lastHarga: lastHarga.get(it.id) ?? null,
  }));

  return (
    <div className="max-w-5xl">
      <Link
        href="/material-issues"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Material Issue
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Pemakaian Bahan Baru
      </h1>
      <p className="text-muted text-sm mb-6">
        Untuk bahan yang keluar gudang di luar produksi: trial R&amp;D, cleaning
        &amp; sanitasi, sampel client, atau bahan yang rusak / tumpah.
      </p>

      {/* Tanggal "hari ini" dihitung di server pada zona operasional,
          bukan zona server yang berjalan di UTC. */}
      <MaterialIssueForm items={issueItems} hariIni={localDateStr()} />
    </div>
  );
}
