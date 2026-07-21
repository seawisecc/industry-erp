"use client";

/* ============================================================
   Guide Order — panduan belanja otomatis.
   Sistem menarik item yang stoknya di bawah/mendekati stok minimum,
   menyarankan qty (dibulatkan ke MOQ), lalu membuat PO terpisah
   per supplier dalam sekali klik.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, TriangleAlert } from "lucide-react";
import { createPOsFromGuide, type GuideLine } from "./actions";

export type GuideItem = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  stokMin: number;
  moq: number | null;
  harga: number | null;
  supplier_id: string | null;
  supplier_nama: string | null;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatNum(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

// Saran qty: tutupi kekurangan sampai 2× stok minimum, dibulatkan ke MOQ
function saranQty(it: GuideItem) {
  const target = it.stokMin > 0 ? it.stokMin * 2 : 0;
  const kurang = Math.max(0, target - it.stok);
  if (kurang <= 0) return it.moq && it.moq > 0 ? it.moq : 0;
  if (it.moq && it.moq > 0) return Math.ceil(kurang / it.moq - 1e-9) * it.moq;
  return Math.ceil(kurang);
}

export default function GuideOrderForm({ items }: { items: GuideItem[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const it of items) init[it.id] = String(saranQty(it));
    return init;
  });
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [ppn, setPpn] = useState("11");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string>("");

  // Baris yang benar-benar akan dipesan
  const lines: GuideLine[] = items
    .filter((it) => it.supplier_id && parseNum(qty[it.id] || "") > 0)
    .map((it) => ({
      supplier_id: it.supplier_id!,
      supplier_nama: it.supplier_nama || "—",
      item_id: it.id,
      qty: parseNum(qty[it.id]),
      harga: it.harga ?? 0,
    }));

  // Ringkasan per supplier (preview PO yang akan dibuat)
  const perSupplier = new Map<string, { nama: string; baris: number; nilai: number }>();
  for (const l of lines) {
    const cur = perSupplier.get(l.supplier_id) || {
      nama: l.supplier_nama,
      baris: 0,
      nilai: 0,
    };
    cur.baris++;
    cur.nilai += l.qty * l.harga;
    perSupplier.set(l.supplier_id, cur);
  }
  const totalNilai = lines.reduce((s, l) => s + l.qty * l.harga, 0);
  const tanpaSupplier = items.filter((it) => !it.supplier_id).length;

  function moqIssue(it: GuideItem): string | null {
    const q = parseNum(qty[it.id] || "");
    if (!it.moq || it.moq <= 0 || q <= 0) return null;
    if (q < it.moq) return `min ${formatNum(it.moq)}`;
    const r = q / it.moq;
    if (Math.abs(r - Math.round(r)) > 1e-9) return `kelipatan ${formatNum(it.moq)}`;
    return null;
  }
  const adaMoqSalah = items.some((it) => moqIssue(it));

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setError("");
    setResult("");
    const res = await createPOsFromGuide(lines, tanggal, parseNum(ppn));
    if (res.ok) {
      const gagal = res.failed && res.failed.length > 0
        ? ` — ${res.failed.length} gagal: ${res.failed
            .map((f) => `${f.supplier} (${f.error})`)
            .join("; ")}`
        : "";
      setResult(`✓ ${res.created} PO berhasil dibuat${gagal}`);
      router.refresh();
      if (!gagal) setTimeout(() => router.push("/purchase-orders"), 1200);
    } else {
      setError(res.error || "Gagal membuat PO");
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Pengaturan PO ===== */}
      <div className="glass rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Tanggal PO
          </label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            PPN (%)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={ppn}
            onChange={(e) => setPpn(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex items-end">
          <div className="text-[12.5px] text-muted">
            {perSupplier.size > 0
              ? `${perSupplier.size} PO akan dibuat · total ${formatRupiah(totalNilai)}`
              : "Isi qty minimal satu item"}
          </div>
        </div>
      </div>

      {/* ===== Tabel item stok rendah ===== */}
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Supplier</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Stok</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Stok Min</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">MOQ</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap w-[130px]">Qty Order</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Harga</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Semua stok aman 🎉 — tidak ada item di bawah stok minimum.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const q = parseNum(qty[it.id] || "");
                const issue = moqIssue(it);
                const habis = it.stok <= 0;
                return (
                  <tr
                    key={it.id}
                    className={`border-b border-line last:border-0 ${
                      habis ? "bg-clay-100/25" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium max-w-[200px] truncate" title={it.nama}>
                        {it.nama}
                      </div>
                      <div className="text-[11px] text-muted font-mono">{it.kode}</div>
                    </td>
                    <td className="px-4 py-3">
                      {it.supplier_nama ? (
                        <div className="max-w-[150px] truncate text-[12.5px]" title={it.supplier_nama}>
                          {it.supplier_nama}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-clay-600">
                          <TriangleAlert size={12} /> belum ada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={habis ? "text-clay-600 font-semibold" : ""}>
                        {formatNum(it.stok)} {it.satuan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-muted">
                      {formatNum(it.stokMin)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-muted">
                      {it.moq ? formatNum(it.moq) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={qty[it.id] || ""}
                        onChange={(e) =>
                          setQty((s) => ({ ...s, [it.id]: e.target.value }))
                        }
                        disabled={!it.supplier_id}
                        placeholder="0"
                        className={`w-full glass-input rounded-lg px-2.5 py-2 text-[13px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-40 ${
                          issue ? "ring-2 ring-clay-500" : ""
                        }`}
                      />
                      {issue && (
                        <div className="text-clay-600 text-[10.5px] mt-0.5 text-right">
                          {issue}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {it.harga != null ? formatRupiah(it.harga) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                      {q > 0 && it.harga != null ? formatRupiah(q * it.harga) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {tanpaSupplier > 0 && (
        <p className="text-amber-500 text-[12px] bg-amber-100 rounded-lg px-3 py-2">
          {tanpaSupplier} item belum punya supplier — hubungkan Item ke Material
          yang bersupplier dulu supaya bisa dipesan lewat Guide Order.
        </p>
      )}

      {/* ===== Preview PO per supplier ===== */}
      {perSupplier.size > 0 && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            PO yang Akan Dibuat
          </h3>
          <div className="flex flex-col gap-2">
            {Array.from(perSupplier.values()).map((s) => (
              <div
                key={s.nama}
                className="flex items-center justify-between border border-line rounded-xl px-4 py-2.5 text-[13px]"
              >
                <span className="font-medium truncate">{s.nama}</span>
                <span className="text-muted text-[12.5px] whitespace-nowrap ml-3">
                  {s.baris} item · {formatRupiah(s.nilai)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
      {result && (
        <p className="text-botanical-700 text-[13px] font-medium">{result}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || lines.length === 0 || adaMoqSalah}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <ShoppingCart size={16} />
        )}
        {loading
          ? "Membuat PO..."
          : perSupplier.size > 1
            ? `Buat ${perSupplier.size} PO (split per supplier)`
            : "Buat PO"}
      </button>
    </div>
  );
}
