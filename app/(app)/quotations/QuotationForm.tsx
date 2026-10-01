"use client";

/* ============================================================
   Form quotation: baris BEBAS, bukan pilihan dari master.

   Yang ditawarkan hampir selalu barang baru (maklon, sample kit,
   layanan), jadi tidak ada ProductPicker, tidak ada harga master,
   dan tidak ada cek stok. Rekap & pajaknya tetap komponen dan rumus
   yang sama dengan invoice (InvoiceTotals + computeTotals), karena
   angka ini yang nanti turun jadi Proforma.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import NumberInput from "@/components/NumberInput";
import InvoiceTotals, { type ModeDiskon } from "@/components/InvoiceTotals";
import { useConfirmSave } from "@/components/ConfirmSave";
import { computeTotals, type TaxSettings } from "@/lib/invoiceMath";
import { enterKeFieldBerikutnya } from "@/lib/keyboard";
import { addDaysStr, localDateStr } from "@/lib/dates";
import {
  BERLAKU_HARI_DEFAULT,
  type QuotationHeaderInput,
  type QuotationItemInput,
} from "@/lib/quotation";
import { saveQuotation } from "./actions";

type Row = {
  deskripsi: string;
  keterangan: string;
  satuan: string;
  qty: string;
  harga: string;
};

const BARIS_KOSONG: Row = {
  deskripsi: "",
  keterangan: "",
  satuan: "",
  qty: "",
  harga: "",
};

export type QuotationAwal = {
  id: string;
  no_quotation: string;
  header: QuotationHeaderInput;
  items: QuotationItemInput[];
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function QuotationForm({
  clients,
  taxSettings,
  awal,
}: {
  clients: ClientOption[];
  /**
   * Cuma untuk tampilan. Server action membaca aturan pajak sendiri dan
   * RPC menghitung ulang totalnya.
   */
  taxSettings: TaxSettings;
  awal?: QuotationAwal;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const isEdit = !!awal;
  const h = awal?.header;

  const [clientId, setClientId] = useState(h?.client_id || "");
  const [namaPenerima, setNamaPenerima] = useState(h?.nama_penerima || "");
  const [up, setUp] = useState(h?.up || "");
  const [perihal, setPerihal] = useState(h?.perihal || "");
  const [tanggal, setTanggal] = useState(h?.tanggal || localDateStr());
  const [berlaku, setBerlaku] = useState(
    h ? h.berlaku_sampai || "" : addDaysStr(localDateStr(), BERLAKU_HARI_DEFAULT)
  );
  // Quotation tidak punya diskon otomatis, jadi kolom Discount selalu
  // manual. Nominal tetap dikonversi jadi persen UTUH tanpa pembulatan,
  // aturan yang sama dengan InvoiceForm.
  const [modeDiskon, setModeDiskon] = useState<ModeDiskon>("persen");
  const [diskon, setDiskon] = useState(String(h?.diskon_percent ?? 0));
  const [diskonRp, setDiskonRp] = useState("0");
  const [pakaiTax, setPakaiTax] = useState(h?.pakai_tax ?? false);
  const [syarat, setSyarat] = useState(h?.syarat || "");
  const [rows, setRows] = useState<Row[]>(
    awal && awal.items.length > 0
      ? awal.items.map((it) => ({
          deskripsi: it.deskripsi,
          keterangan: it.keterangan || "",
          satuan: it.satuan || "",
          qty: String(it.qty),
          harga: String(it.harga),
        }))
      : [{ ...BARIS_KOSONG }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const barisIsi = rows.filter((r) => r.deskripsi.trim());
  const calcItems = barisIsi.map((r) => ({
    qty: parseNum(r.qty),
    harga: parseNum(r.harga),
  }));
  const subtotalBaris = calcItems.reduce((s, it) => s + it.qty * it.harga, 0);
  const diskonRpAngka = parseNum(diskonRp);
  const diskonPersen =
    modeDiskon === "nominal"
      ? subtotalBaris > 0
        ? (diskonRpAngka / subtotalBaris) * 100
        : 0
      : parseNum(diskon);

  const totals = computeTotals(
    calcItems,
    diskonPersen,
    pakaiTax,
    taxSettings.taxPercent,
    taxSettings.taxMode,
    taxSettings.dppNilaiLain
  );

  function gantiModeDiskon(mode: ModeDiskon) {
    // Potongan yang sedang berlaku dibawa ke satuan barunya.
    if (mode === "nominal") {
      setDiskonRp(String(Math.round(totals.diskon * 100) / 100));
    } else {
      setDiskon(String(Math.round(diskonPersen * 100) / 100));
    }
    setModeDiskon(mode);
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (!clientId && !namaPenerima.trim()) {
      setError("Pilih client atau isi nama penerima");
      return;
    }
    if (barisIsi.length === 0) {
      setError("Isi minimal satu baris penawaran");
      return;
    }
    if (barisIsi.some((r) => parseNum(r.qty) <= 0)) {
      setError("Qty tiap baris harus lebih dari 0");
      return;
    }
    if (modeDiskon === "nominal" && diskonRpAngka > subtotalBaris) {
      setError("Diskon melebihi Sub-Total");
      return;
    }
    if (diskonPersen < 0 || diskonPersen > 100) {
      setError("Diskon harus di antara 0 dan 100%");
      return;
    }
    if (berlaku && berlaku < tanggal) {
      setError("Tanggal berlaku tidak boleh sebelum tanggal quotation");
      return;
    }

    const penerima =
      clients.find((c) => c.id === clientId)?.company_brand || namaPenerima;
    const lanjut = await konfirmasi.minta({
      judul: isEdit ? "Simpan perubahan quotation ini?" : "Simpan quotation baru?",
      pesan: "Quotation tidak memotong stok dan belum menjadi tagihan.",
      ringkasan: [
        ...(isEdit ? [{ label: "No.", nilai: awal!.no_quotation }] : []),
        { label: "Kepada", nilai: penerima },
        ...(perihal.trim() ? [{ label: "Perihal", nilai: perihal.trim() }] : []),
        { label: "Baris", nilai: barisIsi.length + " baris" },
        { label: "Total", nilai: formatRupiah(totals.total) },
      ],
      tombol: "Ya, Simpan",
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const res = await saveQuotation(
        awal?.id ?? null,
        {
          client_id: clientId || null,
          nama_penerima: namaPenerima.trim() || null,
          up: up.trim() || null,
          perihal: perihal.trim() || null,
          tanggal,
          berlaku_sampai: berlaku || null,
          diskon_percent: diskonPersen,
          pakai_tax: pakaiTax,
          syarat: syarat.trim() || null,
        },
        barisIsi.map((r) => ({
          deskripsi: r.deskripsi.trim(),
          keterangan: r.keterangan.trim() || null,
          satuan: r.satuan.trim() || null,
          qty: parseNum(r.qty),
          harga: parseNum(r.harga),
        }))
      );
      if (res.ok) {
        router.push(`/quotations/${res.id}`);
        router.refresh();
      } else {
        setError(res.error);
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={enterKeFieldBerikutnya}
      className="flex flex-col gap-5"
    >
      <div className="relative z-40 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative z-50">
            <label className={labelCls}>Client</label>
            <ClientPicker
              clients={clients}
              value={clientId}
              onChange={setClientId}
              placeholder="Ketik nama client..."
              allowEmpty
              emptyLabel="Calon client (belum terdaftar)"
            />
          </div>
          <div>
            <label className={labelCls}>
              Nama Penerima
              <span className="font-normal text-muted/70">
                {" "}
                {clientId ? "(opsional)" : "(wajib bila tanpa client)"}
              </span>
            </label>
            <input
              value={namaPenerima}
              onChange={(e) => setNamaPenerima(e.target.value)}
              placeholder="Nama perusahaan / brand"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              UP / Attn <span className="font-normal text-muted/70">(opsional)</span>
            </label>
            <input
              value={up}
              onChange={(e) => setUp(e.target.value)}
              placeholder="Nama yang dituju"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className={labelCls}>
              Perihal <span className="font-normal text-muted/70">(opsional)</span>
            </label>
            <input
              value={perihal}
              onChange={(e) => setPerihal(e.target.value)}
              placeholder="Penawaran Maklon Serum 30 ml"
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
          <div>
            <label className={labelCls}>
              Berlaku Sampai{" "}
              <span className="font-normal text-muted/70">(opsional)</span>
            </label>
            <input
              type="date"
              value={berlaku}
              min={tanggal}
              onChange={(e) => setBerlaku(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ===== Baris penawaran ===== */}
      <div className="relative z-10 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Yang Ditawarkan
            </h2>
            <p className="text-muted text-[12px] mt-0.5">
              Diketik bebas, tidak perlu ada di master Products atau Services.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { ...BARIS_KOSONG }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline whitespace-nowrap"
          >
            <Plus size={14} /> Tambah Baris
          </button>
        </div>

        <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_90px_90px_150px_130px_32px] gap-2 text-[11.5px] font-medium text-muted px-1">
          <span>Deskripsi</span>
          <span>Qty</span>
          <span>Satuan</span>
          <span>Harga Satuan (Rp)</span>
          <span className="text-right">Subtotal</span>
          <span />
        </div>

        {rows.map((row, idx) => {
          const qty = parseNum(row.qty);
          return (
            <div
              key={idx}
              className="flex flex-col gap-2 rounded-xl border border-line/70 bg-white/40 p-3 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_90px_90px_150px_130px_32px] gap-2 items-center">
                <input
                  value={row.deskripsi}
                  onChange={(e) => updateRow(idx, { deskripsi: e.target.value })}
                  placeholder="mis. Jasa maklon serum 30 ml"
                  aria-label="Deskripsi"
                  className={`${inputCls} col-span-2 sm:col-span-1`}
                />
                <NumberInput
                  value={row.qty}
                  onChange={(nilai) => updateRow(idx, { qty: nilai })}
                  placeholder="Qty"
                  aria-label="Qty"
                  className={inputCls}
                />
                <input
                  value={row.satuan}
                  onChange={(e) => updateRow(idx, { satuan: e.target.value })}
                  placeholder="pcs"
                  aria-label="Satuan"
                  className={inputCls}
                />
                <NumberInput
                  value={row.harga}
                  onChange={(nilai) => updateRow(idx, { harga: nilai })}
                  placeholder="Harga satuan"
                  aria-label="Harga satuan"
                  className={`${inputCls} col-span-2 sm:col-span-1`}
                />
                <div className="flex items-center justify-between sm:justify-end gap-2 text-[13px] whitespace-nowrap px-1">
                  <span className="text-muted text-[11.5px] sm:hidden">Subtotal</span>
                  <span className="font-medium">
                    {row.deskripsi.trim() && qty > 0
                      ? formatRupiah(qty * parseNum(row.harga))
                      : "-"}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Hapus baris"
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
              <textarea
                value={row.keterangan}
                onChange={(e) => updateRow(idx, { keterangan: e.target.value })}
                placeholder="Rincian (opsional): spesifikasi kemasan, isi kit, MOQ, lead time"
                aria-label="Rincian baris"
                rows={1}
                className={`${inputCls} text-[12.5px] py-2 resize-y min-h-[38px]`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-5 items-start">
        {/* ===== Syarat ===== */}
        <div className="glass rounded-2xl p-5 sm:p-6 w-full sm:flex-1">
          <label className={labelCls}>
            Syarat &amp; Ketentuan{" "}
            <span className="font-normal text-muted/70">(ikut tercetak)</span>
          </label>
          <textarea
            value={syarat}
            onChange={(e) => setSyarat(e.target.value)}
            rows={6}
            placeholder={
              "mis.\nPembayaran DP 50% saat PO, pelunasan sebelum barang dikirim.\nLead time produksi 4 s/d 6 minggu setelah sampel disetujui.\nHarga belum termasuk ongkos kirim."
            }
            className={`${inputCls} resize-y`}
          />
        </div>

        {/* ===== Diskon, Tax, Total ===== */}
        <div className="glass rounded-2xl p-6 w-full sm:max-w-sm">
          <InvoiceTotals
            totals={totals}
            taxSettings={taxSettings}
            diskon={diskon}
            onDiskonChange={setDiskon}
            nominal={{
              mode: modeDiskon,
              onModeChange: gantiModeDiskon,
              rupiah: diskonRp,
              onRupiahChange: setDiskonRp,
            }}
            pakaiTax={pakaiTax}
            onPakaiTaxChange={setPakaiTax}
          />
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
        {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Quotation"}
      </button>
      {konfirmasi.dialog}
    </form>
  );
}
