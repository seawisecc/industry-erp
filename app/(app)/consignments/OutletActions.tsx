"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ShoppingBag, Undo2, X } from "lucide-react";
import { reportOutletSale, returOutlet, type OutletLine } from "./actions";
import NumberInput from "@/components/NumberInput";
import { diskonTertimbang } from "@/lib/clientPrice";
import { computeTotals, type TaxSettings } from "@/lib/invoiceMath";

export type OutletProdItem = {
  product_id: string;
  nama: string;
  /** brand pemilik produk; dua produk bisa bernama mirip antar brand */
  brand: string | null;
  varian: string; // "-" bila tanpa varian
  sisa: number;
  harga: number;
  /** diskon khusus outlet untuk produk ini, persen. 0 = tanpa kesepakatan */
  diskon_persen: number;
};

function rupiah(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
/** Angka pajak boleh pecahan; membulatkannya di sini bikin DPP + PPN tidak
 *  lagi persis sama dengan totalnya. */
function rupiahTepat(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function OutletActions({
  clientId,
  clientName,
  produk,
  taxSettings,
}: {
  clientId: string;
  clientName: string;
  produk: OutletProdItem[];
  /** Model pajak perusahaan. RPC-nya membaca sendiri dari database. */
  taxSettings: TaxSettings;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "laku" | "retur">(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [pakaiTax, setPakaiTax] = useState(false);
  const [top, setTop] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


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

  const qtyOf = (p: OutletProdItem) =>
    Math.round(Number((qty[keyOf(p)] || "").replace(/[^\d]/g, "")));

  const barisLaku = produk
    .map((p) => ({
      qty: qtyOf(p),
      harga: p.harga,
      diskonPersen: p.diskon_persen,
    }))
    .filter((b) => b.qty > 0);

  // Proforma menyimpan satu diskon per dokumen, jadi diskon per produk
  // dirangkum jadi persentase tertimbang. Rupiahnya sama persis dengan
  // menghitung baris per baris.
  const diskonPersenDok = diskonTertimbang(barisLaku);
  // Dulu total di dialog ini dihitung tangan dan PPN-nya tidak ikut,
  // jadi angka yang dilihat kasir berbeda dengan Proforma yang terbit.
  const totals = computeTotals(
    barisLaku.map((b) => ({ qty: b.qty, harga: b.harga })),
    diskonPersenDok,
    pakaiTax,
    taxSettings.taxPercent,
    taxSettings.taxMode,
    taxSettings.dppNilaiLain
  );
  const adaDiskonKhusus = produk.some((p) => p.diskon_persen > 0);

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
              diskon_percent: diskonPersenDok,
              pakai_tax: pakaiTax,
              tax_percent: taxSettings.taxPercent,
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
      setError("Gagal, koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi.");
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

      {mode && createPortal(
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
                  {mode === "laku" ? "Catat Laku" : "Catat Retur"} · {clientName}
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
                      {p.brand && <span className="text-muted"> · {p.brand}</span>}
                      {mode === "laku" && (
                        <span className="block text-[11px] text-muted">
                          {rupiah(p.harga)}/pcs
                          {p.diskon_persen > 0 && (
                            <span className="text-botanical-700">
                              {" · diskon "}
                              {p.diskon_persen.toLocaleString("id-ID", {
                                maximumFractionDigits: 2,
                              })}
                              % jadi{" "}
                              {rupiah(
                                p.harga - (p.harga * p.diskon_persen) / 100
                              )}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="text-right text-muted whitespace-nowrap">{p.sisa} pcs</div>
                    <div className="text-right">
                      <NumberInput
                        bulat
                        value={qty[keyOf(p)] || ""}
                        onChange={(nilai) => {
                          // qty di outlet tidak pernah boleh melebihi sisa titipan
                          const n = Math.min(p.sisa, Number(nilai) || 0);
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
                  PPN
                </label>
                <label className="inline-flex items-center gap-2 text-[12.5px]">
                  Tempo (hari)
                  <NumberInput
                    bulat
                    value={top}
                    onChange={setTop}
                    placeholder="0 = tanpa tempo"
                    className="w-28 glass-input rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </label>
                <div className="ml-auto text-right">
                  {totals.diskon > 0 && (
                    <div className="text-[11.5px] text-muted">
                      Subtotal {rupiah(totals.subtotal)} · diskon{" "}
                      <span className="text-botanical-700">
                        {diskonPersenDok.toLocaleString("id-ID", {
                          maximumFractionDigits: 2,
                        })}
                        % − {rupiah(totals.diskon)}
                      </span>
                    </div>
                  )}
                  {pakaiTax && (
                    <div className="text-[11.5px] text-muted">
                      DPP {rupiahTepat(totals.dpp)} · PPN{" "}
                      {rupiahTepat(totals.tax)}
                      <span className="text-muted/70">
                        {taxSettings.taxMode === "Include"
                          ? " (sudah di dalam harga)"
                          : " (ditambahkan)"}
                      </span>
                    </div>
                  )}
                  <div className="text-[13px] font-semibold text-ink">
                    Total: {rupiah(totals.total)}
                  </div>
                </div>
              </div>
            )}

            {mode === "laku" && adaDiskonKhusus && (
              <p className="text-botanical-700 text-[11.5px] px-5 pb-1">
                Diskon khusus outlet ini ikut terpasang di Proforma. Atur
                angkanya di Clients, menu Harga &amp; Diskon Khusus.
              </p>
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
