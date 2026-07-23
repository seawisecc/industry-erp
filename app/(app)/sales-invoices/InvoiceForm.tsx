"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createInvoice } from "./actions";
import { computeTotals } from "@/lib/invoiceMath";

export type ClientOpt = { id: string; kode: string | null; company_brand: string };

export type ProductVariantOpt = {
  key: string; // product_id|varian, atau svc|id untuk jasa
  product_id: string; // "" untuk jasa
  varian: string; // "-" jika tanpa varian
  label: string; // "PRD-0001 — Serum (30 g)"
  available: number;
  harga_jual: number | null;
  service_id: string | null; // terisi bila baris ini layanan jasa
};

type Row = { key: string; qty: string; harga: string };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function InvoiceForm({
  clients,
  options,
  mode,
}: {
  clients: ClientOpt[];
  options: ProductVariantOpt[];
  mode: "invoice" | "pos";
}) {
  const router = useRouter();
  const isPos = mode === "pos";

  // POS = Invoice tunai; non-POS = Proforma (jadi Invoice otomatis saat lunas)
  const tipe: "Proforma" | "Invoice" = isPos ? "Invoice" : "Proforma";
  const [clientId, setClientId] = useState("");
  const [namaPembeli, setNamaPembeli] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [diskon, setDiskon] = useState("0");
  const [pakaiTax, setPakaiTax] = useState(false);
  const [taxPercent, setTaxPercent] = useState("11");
  const [top, setTop] = useState(isPos ? "0" : "");
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState<Row[]>([{ key: "", qty: "", harga: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const optOf = (key: string) => options.find((o) => o.key === key);

  const calcItems = rows
    .filter((r) => r.key)
    .map((r) => ({ qty: parseNum(r.qty), harga: parseNum(r.harga) }));
  const totals = computeTotals(calcItems, parseNum(diskon), pakaiTax, parseNum(taxPercent));

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await createInvoice({
        tipe,
        sumber: isPos ? "POS" : "Direct",
        client_id: clientId || null,
        nama_pembeli: namaPembeli || null,
        tanggal,
        diskon_percent: parseNum(diskon),
        pakai_tax: pakaiTax,
        tax_percent: parseNum(taxPercent),
        top_days: top === "" ? null : Math.max(0, Math.round(parseNum(top))),
        catatan: catatan || null,
        langsung_lunas: isPos,
        items: rows
          .filter((r) => r.key)
          .map((r) => {
            const o = optOf(r.key)!;
            return {
              product_id: o.service_id ? null : o.product_id,
              service_id: o.service_id,
              varian_ukuran: o.service_id || o.varian === "-" ? null : o.varian,
              qty: parseNum(r.qty),
              harga: parseNum(r.harga),
            };
          }),
      });
      if (result.ok && result.invoiceId) {
        router.push(`/print/invoice/${result.invoiceId}`);
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan — koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        {!isPos && (
          <div className="text-[12px] text-muted bg-white/50 rounded-lg px-3 py-2 -mb-1">
            Dibuat sebagai <b>Proforma Invoice</b> (tagihan tempo). Setelah lunas
            di menu Sales Payments, otomatis menjadi Invoice.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={inputCls}
            >
              <option value="">— {isPos ? "Walk-in (tanpa client)" : "Pilih client"} —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kode} — {c.company_brand}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Nama Pembeli{" "}
              <span className="font-normal text-muted/70">
                ({clientId ? "opsional" : "wajib jika tanpa client"})
              </span>
            </label>
            <input
              value={namaPembeli}
              onChange={(e) => setNamaPembeli(e.target.value)}
              placeholder="Nama di dokumen"
              className={inputCls}
            />
          </div>
          {isPos && (
            <div>
              <label className={labelCls}>Tanggal</label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                required
                className={inputCls}
              />
            </div>
          )}
        </div>

        {!isPos && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Tanggal</label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>TOP (hari)</label>
              <input
                type="number"
                min={0}
                value={top}
                onChange={(e) => setTop(e.target.value)}
                placeholder="0 = tunai"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Catatan</label>
              <input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Cust. PO, dsb. (opsional)"
                className={inputCls}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===== Item ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Produk yang Dijual
          </h2>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { key: "", qty: "", harga: "" }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
          >
            <Plus size={14} /> Tambah Baris
          </button>
        </div>

        {rows.map((row, idx) => {
          const o = optOf(row.key);
          const over = o && !o.service_id && parseNum(row.qty) > o.available;
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_150px_120px_32px] gap-2 items-center">
                <select
                  value={row.key}
                  onChange={(e) => {
                    const opt = optOf(e.target.value);
                    // Prefill harga jual dari master produk (tetap bisa diubah)
                    updateRow(idx, {
                      key: e.target.value,
                      harga:
                        opt?.harga_jual != null ? String(opt.harga_jual) : row.harga,
                    });
                  }}
                  className={inputCls}
                >
                  <option value="">— Pilih produk & varian —</option>
                  {options.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                      {opt.service_id
                        ? ""
                        : ` · stok ${opt.available.toLocaleString("id-ID")}`}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.qty}
                  onChange={(e) => updateRow(idx, { qty: e.target.value })}
                  placeholder="Qty"
                  className={`${inputCls} ${over ? "ring-2 ring-clay-500" : ""}`}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.harga}
                  onChange={(e) => updateRow(idx, { harga: e.target.value })}
                  placeholder="Harga/pcs (Rp)"
                  className={inputCls}
                />
                <div className="text-right text-[13px] whitespace-nowrap px-1">
                  {row.key && parseNum(row.qty) > 0
                    ? formatRupiah(parseNum(row.qty) * parseNum(row.harga))
                    : "—"}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) =>
                      rs.length > 1
                        ? rs.filter((_, i) => i !== idx)
                        : [{ key: "", qty: "", harga: "" }]
                    )
                  }
                  className="text-muted hover:text-clay-600 p-2"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {over && (
                <p className="text-clay-600 text-[12px]">
                  Melebihi stok produk jadi ({o!.available.toLocaleString("id-ID")} pcs)
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== Diskon, Tax, Total ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-2 sm:max-w-sm sm:ml-auto sm:w-full text-[13.5px]">
        <div className="flex justify-between">
          <span className="text-muted">Sub-Total</span>
          <span>{formatRupiah(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted flex items-center gap-1.5">
            Discount
            <input
              type="text"
              inputMode="decimal"
              value={diskon}
              onChange={(e) => setDiskon(e.target.value)}
              className="w-14 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
            %
          </span>
          <span className="text-clay-600">
            {totals.diskon > 0 ? `− ${formatRupiah(totals.diskon)}` : formatRupiah(0)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <label className="text-muted flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={pakaiTax}
              onChange={(e) => setPakaiTax(e.target.checked)}
              className="accent-[#2f4f3e]"
            />
            Tax
            <input
              type="text"
              inputMode="decimal"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              disabled={!pakaiTax}
              className="w-12 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-40"
            />
            %
          </label>
          <span>{pakaiTax ? formatRupiah(totals.tax) : "—"}</span>
        </div>
        <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
          <span>TOTAL</span>
          <span>{formatRupiah(totals.total)}</span>
        </div>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading
          ? "Menyimpan..."
          : isPos
            ? "Simpan Penjualan (Lunas) & Cetak"
            : `Simpan ${tipe} & Cetak`}
      </button>
    </form>
  );
}
