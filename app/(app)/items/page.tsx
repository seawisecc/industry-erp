import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, ListChecks, CalendarClock } from "lucide-react";
import BahanShell from "@/components/BahanShell";

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

  const { data: items } = await supabase
    .from("items")
    .select(
      "id, kode, nama, kategori, satuan, stok_minimum, purchase_batches(qty_sisa), materials(material_code, tradename)"
    )
    .eq("organization_id", organizationId)
    .order("kode");

  const list = (items || []) as unknown as ItemRow[];

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
            className="flex items-center gap-1.5 bg-white border border-line text-ink text-[13px] font-medium px-3.5 py-2.5 rounded-sm hover:bg-porcelain transition-colors"
          >
            <CalendarClock size={15} /> Expiry Control
          </Link>
          <Link
            href="/items/from-material"
            className="flex items-center gap-1.5 bg-white border border-line text-ink text-[13px] font-medium px-3.5 py-2.5 rounded-sm hover:bg-porcelain transition-colors"
          >
            <ListChecks size={15} /> Tambah dari Material
          </Link>
          <Link
            href="/items/new"
            className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
          >
            <Plus size={15} /> Tambah Item
          </Link>
        </div>
      </div>

      <div className="mt-4 glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Kode</th>
              <th className="px-4 py-2.5 font-semibold">Nama</th>
              <th className="px-4 py-2.5 font-semibold">Kategori</th>
              <th className="px-4 py-2.5 font-semibold">Stok Sisa</th>
              <th className="px-4 py-2.5 font-semibold">Stok Min</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-10 text-sm">
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
                return (
                  <tr
                    key={item.id}
                    className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[12.5px]">{item.kode}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.nama}</div>
                      {linkedMaterial && (
                        <div className="text-[11.5px] text-muted font-mono">
                          {linkedMaterial.material_code}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{item.kategori}</td>
                    <td className="px-4 py-3">
                      {stokSisa.toLocaleString("id-ID")} {item.satuan}
                    </td>
                    <td className="px-4 py-3">
                      {Number(item.stok_minimum).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
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