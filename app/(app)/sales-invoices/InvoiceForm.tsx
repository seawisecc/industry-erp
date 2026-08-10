"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, CheckCircle2, Receipt, FileText } from "lucide-react";
import { createInvoice } from "./actions";
import { computeTotals } from "@/lib/invoiceMath";
import ClientPicker from "@/components/ClientPicker";
import ProductPicker from "@/components/ProductPicker";
import { clientPriceKey, type ClientPriceMap } from "@/lib/clientPrice";

export type ClientOpt = { id: string; kode: string | null; company_brand: string };

export type ProductVariantOpt = {
  key: string; // product_id|varian, atau svc|id untuk jasa
  product_id: string; // "" untuk jasa
  varian: string; // "-" jika tanpa varian
  label: string; // "PRD-0001, Serum (30 g)"
  available: number;
  harga_jual: number | null;
  service_id: string | null; // terisi bila baris ini layanan jasa
};

/**
 * `hargaManual` menandai baris yang harganya sudah diketik sendiri oleh
 * user. Waktu client diganti, harga baris lain di-isi ulang dengan harga
 * client baru — tapi yang manual TIDAK boleh ikut tertimpa, karena itu
 * angka yang sengaja dinegosiasikan untuk transaksi ini.
 */
type Row = { key: string; qty: string; harga: string; hargaManual: boolean };

const BARIS_KOSONG: Row = { key: "", qty: "", harga: "", hargaManual: false };

/** Transaksi POS yang baru tersimpan, dipakai layar pilihan cetak. */
type Selesai = { id: string; no: string | null; total: number };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function InvoiceForm({
  clients,
  options,
  clientPrices,
  mode,
}: {
  clients: ClientOpt[];
  options: ProductVariantOpt[];
  clientPrices: ClientPriceMap;
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
  const [rows, setRows] = useState<Row[]>([{ ...BARIS_KOSONG }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selesai, setSelesai] = useState<Selesai | null>(null);

  const optOf = (key: string) => options.find((o) => o.key === key);

  /** Harga khusus client kalau ada, kalau tidak harga master produk. */
  function hargaUntuk(key: string, cid: string): number | null {
    const o = optOf(key);
    if (!o) return null;
    // Jasa tidak punya harga per client, tarifnya dari master Services
    if (cid && !o.service_id) {
      const khusus = clientPrices[clientPriceKey(cid, o.product_id, o.varian)];
      if (khusus != null) return khusus;
    }
    return o.harga_jual;
  }

  const punyaHargaKhusus = (key: string) => {
    const o = optOf(key);
    if (!o || !clientId || o.service_id) return false;
    return clientPrices[clientPriceKey(clientId, o.product_id, o.varian)] != null;
  };

  /**
   * Ganti client: harga baris yang belum disentuh user diisi ulang dengan
   * harga client baru. Dikerjakan di handler, BUKAN useEffect — mengubah
   * state sebagai reaksi atas state lain di effect melanggar
   * react-hooks/set-state-in-effect dan menambah satu render setelah
   * layar terlanjur dilukis.
   */
  function gantiClient(id: string) {
    setClientId(id);
    setRows((rs) =>
      rs.map((r) => {
        if (!r.key || r.hargaManual) return r;
        const h = hargaUntuk(r.key, id);
        return h != null ? { ...r, harga: String(h) } : r;
      })
    );
  }

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
        if (isPos) {
          // Kasir yang memilih mau cetak nota 58 mm atau invoice A4,
          // jadi jangan langsung dilempar ke salah satunya.
          setSelesai({
            id: result.invoiceId,
            no: result.noInvoice ?? null,
            total: totals.total,
          });
          setLoading(false);
          router.refresh(); // stok & daftar penjualan hari ini ikut segar
        } else {
          router.push(`/print/invoice/${result.invoiceId}`);
          router.refresh();
        }
      } else {
        setError(result.error || "Gagal menyimpan");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  /** Bersihkan form untuk pembeli berikutnya, tanggal dibiarkan. */
  function transaksiBaru() {
    setSelesai(null);
    setClientId("");
    setNamaPembeli("");
    setDiskon("0");
    setPakaiTax(false);
    setCatatan("");
    setRows([{ ...BARIS_KOSONG }]);
    setError("");
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  // ===== Transaksi POS selesai: pilih mau cetak apa =====
  if (selesai) {
    const cetakCls =
      "flex flex-col items-center justify-center gap-1.5 rounded-xl px-4 py-5 text-[13.5px] font-medium transition-colors";
    return (
      <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-5 text-center">
        <div>
          <CheckCircle2 size={40} className="text-botanical-700 mx-auto" />
          <h2 className="font-display text-[17px] font-semibold text-ink mt-2">
            Transaksi Selesai
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Stok sudah terpotong dan pembayaran tercatat lunas.
          </p>
        </div>

        <div>
          <div className="font-mono text-[12.5px] text-muted">
            {selesai.no || "-"}
          </div>
          <div className="font-display text-2xl font-semibold text-ink">
            {formatRupiah(selesai.total)}
          </div>
        </div>

        <div className="w-full sm:max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href={`/print/nota/${selesai.id}`}
            className={`${cetakCls} bg-botanical-700 text-white hover:bg-botanical-800 shadow-sm`}
          >
            <Receipt size={20} />
            Cetak Nota
            <span className="text-[11.5px] font-normal opacity-80">
              struk kasir 58 mm
            </span>
          </Link>
          <Link
            href={`/print/invoice/${selesai.id}`}
            className={`${cetakCls} bg-white/70 border border-line text-ink hover:bg-white`}
          >
            <FileText size={20} />
            Cetak Invoice
            <span className="text-[11.5px] font-normal text-muted">
              faktur A4
            </span>
          </Link>
        </div>

        <button
          type="button"
          onClick={transaksiBaru}
          className="text-botanical-700 text-[13px] font-medium hover:underline"
        >
          Lanjut Transaksi Baru
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="relative z-40 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
        {!isPos && (
          <div className="text-[12px] text-muted bg-white/50 rounded-lg px-3 py-2">
            Dibuat sebagai <b>Proforma Invoice</b> (tagihan tempo). Setelah lunas
            di menu Sales Payments, otomatis menjadi Invoice.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative z-50">
            <label className={labelCls}>Client</label>
            <ClientPicker
              clients={clients}
              value={clientId}
              onChange={gantiClient}
              placeholder="Ketik nama client..."
              allowEmpty={isPos}
              emptyLabel="Walk-in (tanpa client)"
            />
          </div>
          <div>
            <label className={labelCls}>
              Nama Pembeli
              <span className="font-normal text-muted/70">
                {" "}
                {clientId ? "(opsional)" : "(wajib bila tanpa client)"}
              </span>
            </label>
            <input
              value={namaPembeli}
              onChange={(e) => setNamaPembeli(e.target.value)}
              placeholder="Nama di dokumen"
              className={inputCls}
            />
          </div>
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
        </div>

        {!isPos && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Catatan{" "}
                <span className="font-normal text-muted/70">(opsional)</span>
              </label>
              <input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Cust. PO, dsb."
                className={inputCls}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===== Item ===== */}
      <div className="relative z-10 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Produk yang Dijual
          </h2>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { ...BARIS_KOSONG }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
          >
            <Plus size={14} /> Tambah Baris
          </button>
        </div>

        {rows.map((row, idx) => {
          const o = optOf(row.key);
          const over = o && !o.service_id && parseNum(row.qty) > o.available;
          return (
            <div
              key={idx}
              className="flex flex-col gap-1 rounded-xl border border-line/70 bg-white/40 p-3 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_100px_150px_120px_32px] gap-2 items-center">
                <div className="col-span-2 sm:col-span-1">
                  <ProductPicker
                    options={options}
                    value={row.key}
                    onChange={(key) => {
                      // Prefill harga: harga khusus client kalau ada,
                      // kalau tidak harga master. Tetap bisa diubah.
                      const h = hargaUntuk(key, clientId);
                      updateRow(idx, {
                        key,
                        harga: h != null ? String(h) : row.harga,
                        hargaManual: false,
                      });
                    }}
                    placeholder="Ketik kode / nama produk..."
                  />
                </div>
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
                  onChange={(e) =>
                    updateRow(idx, { harga: e.target.value, hargaManual: true })
                  }
                  placeholder="Harga/pcs (Rp)"
                  className={inputCls}
                />
                <div className="flex items-center justify-between sm:justify-end gap-2 text-[13px] whitespace-nowrap px-1">
                  <span className="text-muted text-[11.5px] sm:hidden">Subtotal</span>
                  <span className="font-medium">
                    {row.key && parseNum(row.qty) > 0
                      ? formatRupiah(parseNum(row.qty) * parseNum(row.harga))
                      : "-"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) =>
                      rs.length > 1
                        ? rs.filter((_, i) => i !== idx)
                        : [{ ...BARIS_KOSONG }]
                    )
                  }
                  className="text-muted hover:text-clay-600 p-2 justify-self-end"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {punyaHargaKhusus(row.key) && !row.hargaManual && (
                <p className="text-botanical-700 text-[11.5px]">
                  Harga khusus client dipakai
                </p>
              )}
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
          <span>{pakaiTax ? formatRupiah(totals.tax) : "-"}</span>
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
