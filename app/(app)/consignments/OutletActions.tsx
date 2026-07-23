"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ShoppingBag, Undo2, X } from "lucide-react";
import { reportOutletSale, returOutlet, type OutletLine } from "./actions";

export type OutletProdItem = {
  product_id: string;
  nama: string;
  varian: string; // "-" bila tanpa varian
  sisa: number;
  harga: number;
};

function rupiah(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

export default function OutletActions({
  clientId,
  clientName,
  produk,
}: {
  clientId: string;
  clientName: string;
  produk: OutletProdItem[];
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<null | "laku" | "retur">(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [pakaiTax, setPakaiTax] = useState(false);
  const [top, setTop] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);

  function keyOf(p: OutletProdItem) {
    return `${p.product_id}|${p.varian}`;
  }
  function reset() {
    setQty({});
    setPakaiTax(false);
    setTop("");
    setError("");
  }
  function buka(m: "laku" | "retur") {
    reset();
    setMode(m);
  }

  function lines(): OutletLine[] {
    return produk
      .map((p) => {
        const n = Math.round(Number((qty[keyOf(p)] || "").replace(/[^\d]/g, "")));
        return n > 0
          ? {
              product_id: p.product_id,
              varian_ukuran: p.varian === "-" ? null : p.varian,
              qty: n,
              harga: p.harga,
            }
          : null;
      })
      .filter(Boolean) as OutletLine[];
  }

  const totalLaku = produk.reduce((s, p) => {
    const n = Math.round(Number((qty[keyOf(p)] || "").replace(/[^\d]/g, "")));
    return s + (n > 0 ? n * p.harga : 0);
  }, 0);

  async function submit() {
    if (loading || !mode) return;
    const ls = lines();
    if (ls.length === 0) {
      setError("Isi qty minimal satu produk");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res =
        mode === "laku"
          ? await reportOutletSale(clientId, ls, {
              diskon_percent: 0,
              pakai_tax: pakaiTax,
              tax_percent: 11,
              top_days: top === "" ? null : Math.max(0, parseInt(top) || 0),
            })
          : await returOutlet(clientId, ls);
      if (res.ok) {
        setMode(null);
        reset();
        router.refresh();
      } else {
        setError(res.error || "Gagal");
      }
    } catch {
      setError("Gagal — koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-24 glass-input rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => buka("laku")}
          className="inline-flex items-center gap-1.5 bg-botanical-700 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-botanical-800 transition-colors"
        >
          <ShoppingBag size={13} /> Catat Laku
        </button>
        <button
          onClick={() => buka("retur")}
          className="inline-flex items-center gap-1.5 bg-white/70 border border-line text-ink text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
        >
          <Undo2 size={13} /> Retur
        </button>
      </div>

      {mode && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => !loading && setMode(null)}
        >
          <div className="absolute inset-0 bg-botanical-900/50 backdrop-blur-[2px]" />
          <div
            className="relative bg-[#FAF7F1] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-line">
              <div>
                <h3 className="font-display text-[16px] font-semibold text-ink">
                  {mode === "laku" ? "Catat Laku" : "Catat Retur"} — {clientName}
                </h3>
                <p className="text-[12px] text-muted mt-0.5">
                  {mode === "laku"
                    ? "Barang laku dipotong dari stok & dibuatkan Proforma Invoice."
                    : "Barang kembali ke stok produk jadi."}
                </p>
              </div>
              <button
                onClick={() => setMode(null)}
                className="text-muted hover:text-ink p-1 -mr-1"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-3">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 items-center text-[13px]">
                <div className="text-[11px] uppercase tracking-wide text-muted">Produk</div>
                <div className="text-[11px] uppercase tracking-wide text-muted text-right">Sisa</div>
                <div className="text-[11px] uppercase tracking-wide text-muted text-right pr-1">
                  Qty {mode === "laku" ? "Laku" : "Retur"}
                </div>
                {produk.map((p) => (
                  <div key={keyOf(p)} className="contents">
                    <div className="truncate">
                      {p.nama}
                      {p.varian !== "-" && <span className="text-muted"> · {p.varian}</span>}
                      {mode === "laku" && (
                        <span className="block text-[11px] text-muted">
                          {rupiah(p.harga)}/pcs
                        </span>
                      )}
                    </div>
                    <div className="text-right text-muted whitespace-nowrap">{p.sisa} pcs</div>
                    <div className="text-right">
                      <input
                        inputMode="numeric"
                        value={qty[keyOf(p)] || ""}
                        onChange={(e) => {
                          const d = e.target.value.replace(/[^\d]/g, "");
                          const n = Math.min(p.sisa, Number(d) || 0);
                          setQty((q) => ({ ...q, [keyOf(p)]: n ? String(n) : "" }));
                        }}
                        placeholder="0"
                        className={inputCls}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {mode === "laku" && (
              <div className="px-5 pb-2 flex items-center justify-between gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={pakaiTax}
                    onChange={(e) => setPakaiTax(e.target.checked)}
                    className="accent-[#2f4f3e]"
                  />
                  PPN 11%
                </label>
                <label className="inline-flex items-center gap-2 text-[12.5px]">
                  Tempo (hari)
                  <input
                    inputMode="numeric"
                    value={top}
                    onChange={(e) => setTop(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0 = tanpa tempo"
                    className="w-28 glass-input rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </label>
                <div className="text-[13px] font-semibold text-ink ml-auto">
                  Total: {rupiah(totalLaku)}
                </div>
              </div>
            )}

            {error && <p className="text-clay-600 text-[12px] px-5 pt-1">{error}</p>}

            <div className="flex items-center gap-2 px-5 pt-3 pb-5">
              <button
                onClick={submit}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium py-2.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
              >
                {loading
                  ? "Menyimpan..."
                  : mode === "laku"
                    ? "Catat Laku & Buat Proforma"
                    : "Catat Retur"}
              </button>
              <button
                onClick={() => setMode(null)}
                disabled={loading}
                className="px-4 py-2.5 rounded-lg border border-line text-[13px] font-medium text-muted hover:bg-white/60 transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
