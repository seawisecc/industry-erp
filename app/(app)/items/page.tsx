import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, ListChecks, CalendarClock, ArrowUp, ArrowDown } from "lucide-react";
import BahanShell from "@/components/BahanShell";
import TableSearch from "@/components/TableSearch";

type ItemRow = {
  id: string;
  kode: string;
  nama: string;
  kategori: "Bahan Baku" | "Kemasan";
  satuan: string;
  stok_minimum: number;
  purchase_batches: { qty_sisa: number }[];
  materials: { material_code: string; tradename: string }[];
};

export default async function ItemsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: items }, { data: priceHistory }] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, kode, nama, kategori, satuan, stok_minimum, purchase_batches(qty_sisa), materials(material_code, tradename)"
      )
      .eq("organization_id", organizationId)
      .order("kode"),
    // Riwayat harga beli (terbaru dulu) untuk harga terakhir + tren
    supabase
      .from("purchase_batches")
      .select("item_id, harga_per_unit, tanggal_terima, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  const list = (items || []) as unknown as ItemRow[];

  // Harga terakhir & harga sebelumnya per item → arah tren
  const hargaInfo = new Map<
    string,
    { last: number; prev: number | null; tanggal: string | null }
  >();
  for (const b of (priceHistory || []) as {
    item_id: string;
    harga_per_unit: number;
    tanggal_terima: string | null;
  }[]) {
    const harga = Number(b.harga_per_unit);
    if (harga <= 0) continue; // abaikan batch adjustment tanpa harga
    const cur = hargaInfo.get(b.item_id);
    if (!cur) {
      hargaInfo.set(b.item_id, {
        last: harga,
        prev: null,
        tanggal: b.tanggal_terima,
      });
    } else if (cur.prev === null) {
      cur.prev = harga;
    }
  }

  return (
    <BahanShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Stock Items
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {list.length} item terdaftar — stok masuk lewat menu Receiving
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/items/expiry"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <CalendarClock size={14} /> Expiry Control
          </Link>
          <Link
            href="/items/from-material"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <ListChecks size={14} /> Tambah dari Material
          </Link>
          <Link
            href="/items/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={14} /> Tambah Item
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <TableSearch
          placeholder="Cari kode / nama item..."
          filters={[{ label: "Semua Kategori", options: ["Bahan Baku", "Kemasan"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[880px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kode</th>
              <th className="px-4 py-2.5 font-semibold">Nama</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kategori</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                Harga Terakhir
              </th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap text-right">Stok Sisa</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap text-right">Stok Min</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Belum ada item.
                </td>
              </tr>
            ) : (
              list.map((item) => {
                const stokSisa = item.purchase_batches.reduce(
                  (s, b) => s + Number(b.qty_sisa),
                  0
                );
                const low = stokSisa <= Number(item.stok_minimum);
                const linkedMaterial = item.materials?.[0];
                const hi = hargaInfo.get(item.id);
                const naik = hi?.prev != null && hi.last > hi.prev;
                const turun = hi?.prev != null && hi.last < hi.prev;
                const selisihPct =
                  hi?.prev != null && hi.prev > 0
                    ? ((hi.last - hi.prev) / hi.prev) * 100
                    : null;
                return (
                  <tr
                    key={item.id}
                    className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">{item.kode}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium max-w-[260px] truncate" title={item.nama}>{item.nama}</div>
                      {linkedMaterial && (
                        <div className="text-[11.5px] text-muted font-mono">
                          {linkedMaterial.material_code}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">{item.kategori}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {hi ? (
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <span className="font-medium">
                            Rp{" "}
                            {hi.last.toLocaleString("id-ID", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                          {naik && (
                            <span
                              className="inline-flex items-center text-clay-600"
                              title={`Naik dari Rp ${hi.prev!.toLocaleString("id-ID")}${
                                selisihPct != null
                                  ? ` (+${selisihPct.toLocaleString("id-ID", {
                                      maximumFractionDigits: 1,
                                    })}%)`
                                  : ""
                              }`}
                            >
                              <ArrowUp size={13} strokeWidth={2.5} />
                            </span>
                          )}
                          {turun && (
                            <span
                              className="inline-flex items-center text-botanical-700"
                              title={`Turun dari Rp ${hi.prev!.toLocaleString("id-ID")}${
                                selisihPct != null
                                  ? ` (${selisihPct.toLocaleString("id-ID", {
                                      maximumFractionDigits: 1,
                                    })}%)`
                                  : ""
                              }`}
                            >
                              <ArrowDown size={13} strokeWidth={2.5} />
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {stokSisa.toLocaleString("id-ID")} {item.satuan}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {Number(item.stok_minimum).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${
                          low
                            ? "bg-clay-100 text-clay-600"
                            : "bg-botanical-100 text-botanical-700"
                        }`}
                      >
                        {low ? "Rendah" : "Aman"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/items/${item.id}/edit`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </BahanShell>
  );
}