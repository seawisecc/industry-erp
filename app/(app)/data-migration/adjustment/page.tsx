import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";

type AdjRow = {
  id: string;
  tanggal: string;
  catatan: string | null;
  created_at: string;
  dibuat_oleh: string | null;
  stock_adjustment_items: { id: string }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function StockAdjustmentPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: adjustments }, { data: profiles }] = await Promise.all([
    supabase
      .from("stock_adjustments")
      .select("id, tanggal, catatan, created_at, dibuat_oleh, stock_adjustment_items(id)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, nama")
      .eq("organization_id", organizationId),
  ]);

  const list = (adjustments || []) as unknown as AdjRow[];
  const namaOleh = new Map(
    ((profiles || []) as { id: string; nama: string }[]).map((p) => [p.id, p.nama])
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Adjustment Stok
          </h1>
          <p className="text-muted text-sm mt-1">
            {list.length} riwayat — untuk stock opname &amp; input stok awal
          </p>
        </div>
        <Link
          href="/data-migration/adjustment/new"
          className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
        >
          <Plus size={16} /> Adjustment Baru
        </Link>
      </div>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold">Catatan</th>
              <th className="px-4 py-2.5 font-semibold">Item Disesuaikan</th>
              <th className="px-4 py-2.5 font-semibold">Oleh</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted py-10 text-sm">
                  Belum ada adjustment.
                </td>
              </tr>
            ) : (
              list.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(a.tanggal)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[300px] truncate">{a.catatan || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {a.stock_adjustment_items.length} item
                  </td>
                  <td className="px-4 py-3">
                    {(a.dibuat_oleh && namaOleh.get(a.dibuat_oleh)) || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/data-migration/adjustment/${a.id}`}
                      className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
