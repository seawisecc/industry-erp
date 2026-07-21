import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Calculator } from "lucide-react";
import InciPanel, { InciEntry } from "./InciPanel";

type ProductRaw = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  kategori: string | null;
  batch_size_kg: number | null;
  aktif: boolean;
  product_formulas: { item_id: string; percentage: number; fase: string | null }[];
  product_process_steps: {
    urutan: number;
    instruksi: string;
    suhu: string | null;
    rpm: string | null;
    durasi: string | null;
  }[];
  product_variants: {
    nama_varian: string;
    netto: number | null;
    satuan_netto: string | null;
    harga_jual: number | null;
    variant_packaging: { item_id: string; qty_per_pcs: number }[];
  }[];
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: items }, { data: batches }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, kode, nama_produk, brand, kategori, batch_size_kg, aktif,
         product_formulas(item_id, percentage, fase),
         product_process_steps(urutan, instruksi, suhu, rpm, durasi),
         product_variants(nama_varian, netto, satuan_netto, harga_jual, variant_packaging(item_id, qty_per_pcs))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase
      .from("items")
      .select("id, kode, nama, satuan")
      .eq("organization_id", organizationId),
    supabase
      .from("purchase_batches")
      .select("item_id, harga_per_unit, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  if (!data) notFound();
  const product = data as unknown as ProductRaw;

  const itemMap = new Map(
    ((items || []) as { id: string; kode: string; nama: string; satuan: string }[]).map(
      (it) => [it.id, it]
    )
  );
  const lastHarga = new Map<string, number>();
  for (const b of (batches || []) as {
    item_id: string;
    harga_per_unit: number;
  }[]) {
    if (!lastHarga.has(b.item_id)) lastHarga.set(b.item_id, Number(b.harga_per_unit));
  }

  // ===== Costing (estimasi HPP) =====
  const batchKg = product.batch_size_kg == null ? 0 : Number(product.batch_size_kg);
  const missingPrice: string[] = [];
  let bulkCostPerBatch = 0;
  for (const f of product.product_formulas) {
    const harga = lastHarga.get(f.item_id);
    const nama = itemMap.get(f.item_id)?.nama || "item";
    if (harga == null) {
      missingPrice.push(nama);
      continue;
    }
    bulkCostPerBatch += (Number(f.percentage) / 100) * batchKg * harga;
  }
  const costPerKg = batchKg > 0 ? bulkCostPerBatch / batchKg : 0;

  const variantCosts = product.product_variants.map((v) => {
    const netto = v.netto == null ? 0 : Number(v.netto);
    const bulkCost = (netto / 1000) * costPerKg; // g/ml → kg
    let packCost = 0;
    for (const p of v.variant_packaging) {
      const harga = lastHarga.get(p.item_id);
      const nama = itemMap.get(p.item_id)?.nama || "kemasan";
      if (harga == null) {
        if (!missingPrice.includes(nama)) missingPrice.push(nama);
        continue;
      }
      packCost += Number(p.qty_per_pcs) * harga;
    }
    const total = bulkCost + packCost;
    const hargaJual = v.harga_jual == null ? null : Number(v.harga_jual);
    return {
      nama: v.nama_varian,
      bulkCost,
      packCost,
      total,
      hargaJual,
      margin: hargaJual != null && hargaJual > 0 ? hargaJual - total : null,
    };
  });

  // ===== Formula (untuk ditampilkan) =====
  const formulaRows = product.product_formulas
    .map((f) => {
      const it = itemMap.get(f.item_id);
      return {
        kode: it?.kode || "—",
        nama: it?.nama || "(item terhapus)",
        satuan: it?.satuan || "",
        fase: f.fase || "",
        pct: Number(f.percentage),
        qtyPerBatch: (Number(f.percentage) / 100) * batchKg,
      };
    })
    .sort((a, b) => b.pct - a.pct);
  const totalPct = formulaRows.reduce((s, r) => s + r.pct, 0);

  const stepRows = (product.product_process_steps || []).sort(
    (a, b) => a.urutan - b.urutan
  );

  // ===== INCI aggregation =====
  const formulaItemIds = product.product_formulas.map((f) => f.item_id);
  const inciWarnings: string[] = [];
  const inciMapAgg = new Map<string, number>();

  if (formulaItemIds.length > 0) {
    const { data: materials } = await supabase
      .from("materials")
      .select("item_id, tradename, material_inci(inci_name, percentage)")
      .eq("organization_id", organizationId)
      .in("item_id", formulaItemIds);

    const matByItem = new Map(
      (
        (materials || []) as unknown as {
          item_id: string;
          tradename: string;
          material_inci: { inci_name: string; percentage: number }[];
        }[]
      ).map((m) => [m.item_id, m])
    );

    for (const f of product.product_formulas) {
      const mat = matByItem.get(f.item_id);
      const itemNama = itemMap.get(f.item_id)?.nama || "item";
      if (!mat) {
        inciWarnings.push(`"${itemNama}" belum ter-link ke Material`);
        continue;
      }
      if (mat.material_inci.length === 0) {
        inciWarnings.push(`Material "${mat.tradename}" belum punya komposisi INCI`);
        continue;
      }
      for (const inci of mat.material_inci) {
        const contribution = (Number(f.percentage) * Number(inci.percentage)) / 100;
        inciMapAgg.set(
          inci.inci_name,
          (inciMapAgg.get(inci.inci_name) || 0) + contribution
        );
      }
    }
  }

  const inciEntries: InciEntry[] = Array.from(inciMapAgg, ([name, pct]) => ({
    name,
    pct,
  })).sort((a, b) => b.pct - a.pct);

  return (
    <div className="max-w-3xl">
      <Link
        href="/products"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Products
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {product.nama_produk}
        </h1>
        <span className="font-mono text-[13px] text-muted">{product.kode}</span>
        <Link
          href={`/products/${product.id}/edit`}
          className="ml-auto flex items-center gap-1.5 bg-white border border-line text-ink text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-porcelain transition-colors"
        >
          <Pencil size={14} /> Edit
        </Link>
      </div>
      <p className="text-muted text-sm mb-6">
        {[product.brand, product.kategori].filter(Boolean).join(" · ") || "—"}
        {batchKg > 0 ? ` · 1 batch = ${batchKg.toLocaleString("id-ID")} kg bulk` : ""}
      </p>

      {/* ===== Formula ===== */}
      <div className="glass rounded-2xl p-6 mb-5 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Formulasi Bahan Baku
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {formulaRows.length} bahan · total {totalPct.toLocaleString("id-ID")}%
            {batchKg > 0
              ? ` · qty per batch = % × ${batchKg.toLocaleString("id-ID")} kg`
              : ""}
          </p>
        </div>
        {formulaRows.length === 0 ? (
          <p className="text-muted text-[13px]">Belum ada formulasi.</p>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-b border-line bg-white/50">
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Kode</th>
                  <th className="px-3 py-2 font-semibold">Bahan</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Fase</th>
                  <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">%</th>
                  {batchKg > 0 && (
                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">
                      Qty / Batch
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {formulaRows.map((r) => (
                  <tr key={r.kode + r.nama} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
                      {r.kode}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="max-w-[280px] truncate" title={r.nama}>
                        {r.nama}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.fase || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {r.pct.toLocaleString("id-ID", { maximumFractionDigits: 3 })}%
                    </td>
                    {batchKg > 0 && (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {r.qtyPerBatch.toLocaleString("id-ID", {
                          maximumFractionDigits: 3,
                        })}{" "}
                        {r.satuan || "kg"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Cara Pembuatan ===== */}
      {stepRows.length > 0 && (
        <div className="glass rounded-2xl p-6 mb-5 flex flex-col gap-3">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Cara Pembuatan
          </h2>
          <ol className="flex flex-col gap-2">
            {stepRows.map((s) => (
              <li key={s.urutan} className="flex gap-3 text-[13.5px]">
                <span className="font-semibold text-botanical-700 w-6 text-right flex-shrink-0">
                  {s.urutan}.
                </span>
                <div>
                  {s.instruksi}
                  {(s.suhu || s.rpm || s.durasi) && (
                    <span className="text-muted text-[12px] ml-1.5">
                      (
                      {[s.suhu, s.rpm && `${s.rpm} rpm`, s.durasi]
                        .filter(Boolean)
                        .join(" · ")}
                      )
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ===== Costing / HPP ===== */}
      <div className="glass rounded-2xl p-6 mb-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-botanical-100 text-botanical-700 rounded-xl p-2.5">
            <Calculator size={18} />
          </div>
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Estimasi Harga Pokok (HPP)
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Dihitung dari harga pembelian terakhir bahan baku &amp; kemasan —
              sebagai informasi, bukan angka akuntansi final.
            </p>
          </div>
        </div>

        {missingPrice.length > 0 && (
          <div className="bg-amber-100 text-amber-500 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed">
            ⚠ Belum ada harga pembelian untuk: {missingPrice.join(", ")} — estimasi
            di bawah belum lengkap.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/60 border border-line rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-1">
              Cost Bulk / Batch ({batchKg.toLocaleString("id-ID")} kg)
            </div>
            <div className="font-display text-[19px] font-semibold text-ink">
              {formatRupiah(bulkCostPerBatch)}
            </div>
          </div>
          <div className="bg-white/60 border border-line rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-1">
              Cost Bulk / kg
            </div>
            <div className="font-display text-[19px] font-semibold text-ink">
              {formatRupiah(costPerKg)}
            </div>
          </div>
        </div>

        {variantCosts.length > 0 && (
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-b border-line bg-white/50">
                  <th className="px-3 py-2 font-semibold">Varian</th>
                  <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Cost Bulk/pcs</th>
                  <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Cost Kemasan/pcs</th>
                  <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Est. HPP/pcs</th>
                  <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Harga Jual</th>
                  <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Margin</th>
                </tr>
              </thead>
              <tbody>
                {variantCosts.map((v) => (
                  <tr key={v.nama} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{v.nama}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {formatRupiah(v.bulkCost)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {formatRupiah(v.packCost)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold text-botanical-700">
                      {formatRupiah(v.total)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold">
                      {v.hargaJual != null ? formatRupiah(v.hargaJual) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {v.margin != null ? (
                        <span
                          className={
                            v.margin >= 0
                              ? "text-botanical-700 font-medium"
                              : "text-clay-600 font-medium"
                          }
                        >
                          {formatRupiah(v.margin)}
                          {v.hargaJual! > 0 && (
                            <span className="block text-[10.5px] text-muted font-normal">
                              {((v.margin / v.hargaJual!) * 100).toLocaleString(
                                "id-ID",
                                { maximumFractionDigits: 1 }
                              )}
                              %
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== INCI Generator ===== */}
      <InciPanel entries={inciEntries} warnings={inciWarnings} />
    </div>
  );
}
