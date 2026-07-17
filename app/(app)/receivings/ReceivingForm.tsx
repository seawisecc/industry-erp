"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceiving } from "./actions";

export type POOption = {
  id: string;
  no_po: string | null;
  status: "Dikirim" | "Diterima Sebagian";
  ppn_percent: number;
  top_days: number | null;
  supplier_nama: string;
  items: {
    po_item_id: string;
    item_id: string;
    kode: string;
    nama: string;
    satuan: string;
    qty_pesan: number;
    qty_diterima: number;
    harga_per_unit: number;
  }[];
};

type Row = {
  po_item_id: string;
  item_id: string;
  kode: string;
  nama: string;
  satuan: string;
  sisa: number;
  qty: string;
  harga: string;
  noLot: string;
  expDate: string;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function ReceivingForm({ pos }: { pos: POOption[] }) {
  const router = useRouter();

  const [poId, setPoId] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [noInvoice, setNoInvoice] = useState("");
  const [ppn, setPpn] = useState("11");
  const [top, setTop] = useState(""); // hari; "" = tidak diset, "0" = Tunai/CIA
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedPO = pos.find((p) => p.id === poId) || null;

  function handlePOChange(nextId: string) {
    setPoId(nextId);
    setError("");
    const po = pos.find((p) => p.id === nextId);
    if (!po) {
      setRows([]);
      return;
    }
    setPpn(String(po.ppn_percent));
    setTop(po.top_days == null ? "" : String(po.top_days));
    setRows(
      po.items
        .map((it) => {
          const sisa = Number(it.qty_pesan) - Number(it.qty_diterima);
          return {
            po_item_id: it.po_item_id,
            item_id: it.item_id,
            kode: it.kode,
            nama: it.nama,
            satuan: it.satuan,
            sisa,
            qty: String(sisa).replace(".", ","),
            harga: String(it.harga_per_unit).replace(".", ","),
            noLot: "",
            expDate: "",
          };
        })
        .filter((r) => r.sisa > 0)
    );
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const subtotal = rows.reduce((s, r) => s + parseNum(r.qty) * parseNum(r.harga), 0);
  const ppnValue = (subtotal * parseNum(ppn)) / 100;
  const total = subtotal + ppnValue;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const overLimit = rows.find((r) => parseNum(r.qty) > r.sisa);
    if (overLimit) {
      setError(
        `Qty "${overLimit.nama}" melebihi sisa PO (maks ${overLimit.sisa.toLocaleString("id-ID")} ${overLimit.satuan}).`
      );
      return;
    }

    setLoading(true);
    setError("");
    try {
      await createReceiving({
        po_id: poId,
        tanggal_terima: tanggal,
        no_invoice: noInvoice || null,
        ppn_percent: parseNum(ppn),
        top_days: top === "" ? null : Math.max(0, Math.round(parseNum(top))),
        items: rows.map((r) => ({
          po_item_id: r.po_item_id,
          item_id: r.item_id,
          qty_masuk: parseNum(r.qty),
          harga_per_unit: parseNum(r.harga),
          no_lot_supplier: r.noLot || null,
          exp_date: r.expDate || null,
        })),
      });
      router.push("/receivings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan penerimaan");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Purchase Order
            </label>
            <select
              value={poId}
              onChange={(e) => handlePOChange(e.target.value)}
              required
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            >
              <option value="">— Pilih PO yang barangnya datang —</option>
              {pos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.no_po} — {p.supplier_nama} ({p.status})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Tanggal Terima
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              required
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              No. Invoice / Surat Jalan{" "}
              <span className="font-normal text-muted/70">(opsional)</span>
            </label>
            <input
              value={noInvoice}
              onChange={(e) => setNoInvoice(e.target.value)}
              placeholder="Nomor faktur dari supplier"
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
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
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              TOP (hari)
            </label>
            <input
              type="number"
              min={0}
              max={365}
              value={top}
              onChange={(e) => setTop(e.target.value)}
              placeholder="30"
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
            <p className="text-[11px] text-muted mt-1">
              {top === ""
                ? "Terisi otomatis dari PO"
                : parseNum(top) === 0
                  ? "Tunai / Cash in Advance"
                  : `Jatuh tempo: ${new Date(
                      new Date(tanggal + "T00:00:00").getTime() +
                        Math.round(parseNum(top)) * 86400000
                    ).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`}
            </p>
          </div>
        </div>
      </div>

      {selectedPO && rows.length === 0 && (
        <div className="glass rounded-2xl p-6 text-clay-600 text-[13px]">
          Semua item di PO ini sudah diterima penuh.
        </div>
      )}

      {rows.length > 0 && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Barang yang Diterima
          </h2>
          <p className="text-muted text-[12.5px] -mt-2">
            Qty terisi otomatis sebesar sisa PO — ubah kalau barang datang sebagian.
            Item yang tidak datang, isi qty 0. Harga diisi sesuai faktur aktual.
          </p>

          {rows.map((row, idx) => (
            <div
              key={row.po_item_id}
              className="border border-line rounded-xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div>
                  <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                    {row.kode}
                  </span>
                  <span className="font-medium text-[13.5px]">{row.nama}</span>
                </div>
                <span className="text-[12px] text-muted">
                  Sisa PO: {row.sisa.toLocaleString("id-ID")} {row.satuan}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11.5px] text-muted mb-1">
                    Qty Masuk ({row.satuan})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.qty}
                    onChange={(e) => updateRow(idx, { qty: e.target.value })}
                    className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-muted mb-1">
                    Harga Aktual / Unit (Rp)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.harga}
                    onChange={(e) => updateRow(idx, { harga: e.target.value })}
                    className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-muted mb-1">
                    No. Lot Supplier
                  </label>
                  <input
                    value={row.noLot}
                    onChange={(e) => updateRow(idx, { noLot: e.target.value })}
                    placeholder="Lot/batch di label"
                    className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-muted mb-1">
                    Exp Date
                  </label>
                  <input
                    type="date"
                    value={row.expDate}
                    onChange={(e) => updateRow(idx, { expDate: e.target.value })}
                    className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </div>
              </div>

              {parseNum(row.qty) > row.sisa && (
                <p className="text-clay-600 text-[12px]">
                  Melebihi sisa PO ({row.sisa.toLocaleString("id-ID")} {row.satuan})
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-2 sm:max-w-sm sm:ml-auto sm:w-full text-[13.5px]">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">PPN {ppn || 0}%</span>
            <span>{formatRupiah(ppnValue)}</span>
          </div>
          <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
            <span>Total Invoice</span>
            <span>{formatRupiah(total)}</span>
          </div>
        </div>
      )}

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !poId || rows.length === 0}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : "Simpan Penerimaan"}
      </button>
    </form>
  );
}
