"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2 } from "lucide-react";
import { createPO, updatePO, deletePO } from "./actions";

export type SupplierOption = { id: string; nama: string };

export type ItemOption = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  supplier_id: string | null;
};

type Row = {
  item: ItemOption | null;
  query: string;
  open: boolean;
  qty: string;
  harga: string;
};

type Props = {
  suppliers: SupplierOption[];
  items: ItemOption[];
  po?: {
    id: string;
    supplier_id: string;
    tanggal_po: string;
    ppn_percent: number;
    catatan: string | null;
    items: { item_id: string; qty_pesan: number; harga_per_unit: number }[];
  };
};

function emptyRow(): Row {
  return { item: null, query: "", open: false, qty: "", harga: "" };
}

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function POForm({ suppliers, items, po }: Props) {
  const router = useRouter();
  const isEdit = !!po;

  const [supplierId, setSupplierId] = useState(po?.supplier_id || "");
  const [tanggal, setTanggal] = useState(
    po?.tanggal_po || new Date().toISOString().slice(0, 10)
  );
  const [ppn, setPpn] = useState(String(po?.ppn_percent ?? 11));
  const [catatan, setCatatan] = useState(po?.catatan || "");
  const [rows, setRows] = useState<Row[]>(() => {
    if (!po) return [emptyRow()];
    return po.items.map((it) => ({
      item: items.find((o) => o.id === it.item_id) || null,
      query: "",
      open: false,
      qty: String(it.qty_pesan).replace(".", ","),
      harga: String(it.harga_per_unit).replace(".", ","),
    }));
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Item yang bisa dipilih: hanya milik supplier terpilih & belum dipakai baris lain
  const usedIds = rows.map((r) => r.item?.id).filter(Boolean);
  const supplierItems = items.filter((it) => it.supplier_id === supplierId);

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleSupplierChange(nextId: string) {
    setSupplierId(nextId);
    // Ganti supplier = daftar item beda → reset semua baris
    setRows([emptyRow()]);
  }

  function filteredFor(row: Row) {
    if (!row.open || !row.query) return [];
    const q = row.query.toLowerCase();
    return supplierItems
      .filter((it) => !usedIds.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) =>
          it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  const subtotal = rows.reduce(
    (s, r) => s + (r.item ? parseNum(r.qty) * parseNum(r.harga) : 0),
    0
  );
  const ppnValue = (subtotal * parseNum(ppn)) / 100;
  const total = subtotal + ppnValue;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || deleting) return;
    setLoading(true);
    setError("");
    try {
      const filled = rows.filter((r) => r.item);
      const payload = {
        supplier_id: supplierId,
        tanggal_po: tanggal,
        ppn_percent: parseNum(ppn),
        catatan: catatan || null,
        items: filled.map((r) => ({
          item_id: r.item!.id,
          qty_pesan: parseNum(r.qty),
          harga_per_unit: parseNum(r.harga),
        })),
      };
      if (isEdit && po) {
        await updatePO(po.id, payload);
      } else {
        await createPO(payload);
      }
      router.push("/purchase-orders");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan PO");
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!po || loading || deleting) return;
    if (!confirm(`Hapus PO ini? Tindakan tidak bisa dibatalkan.`)) return;
    setDeleting(true);
    setError("");
    try {
      await deletePO(po.id);
      router.push("/purchase-orders");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus PO");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Supplier
            </label>
            <select
              value={supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              required
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            >
              <option value="">— Pilih supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Tanggal PO
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

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Catatan <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Misal: kirim bertahap, konfirmasi COA dulu, dsb."
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Item yang Dipesan
          </h2>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            disabled={!supplierId}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline disabled:opacity-40 disabled:no-underline"
          >
            <Plus size={14} /> Tambah Baris
          </button>
        </div>

        {!supplierId ? (
          <p className="text-muted text-[13px] py-3">
            Pilih supplier dulu — daftar item akan mengikuti supplier yang dipilih.
          </p>
        ) : supplierItems.length === 0 ? (
          <p className="text-clay-600 text-[13px] py-3">
            Belum ada item yang terhubung ke supplier ini. Pastikan Material milik
            supplier ini sudah di-link ke Item (menu Material &amp; Stok Bahan).
          </p>
        ) : (
          rows.map((row, idx) => {
            const options = filteredFor(row);
            const rowSubtotal = row.item
              ? parseNum(row.qty) * parseNum(row.harga)
              : 0;
            return (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-[1fr_110px_150px_130px_32px] gap-2 items-start border-b border-line last:border-0 pb-3 last:pb-0"
              >
                <div className="relative">
                  {idx === 0 && (
                    <label className="block text-[11.5px] text-muted mb-1">Item</label>
                  )}
                  {row.item ? (
                    <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                      <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                        {row.item.kode}
                      </span>
                      <span className="truncate flex-1">{row.item.nama}</span>
                      <button
                        type="button"
                        onClick={() => updateRow(idx, { item: null, query: "" })}
                        className="text-muted hover:text-clay-600 flex-shrink-0"
                        title="Ganti item"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={row.query}
                        onChange={(e) =>
                          updateRow(idx, { query: e.target.value, open: true })
                        }
                        onFocus={() => updateRow(idx, { open: true })}
                        onBlur={() =>
                          setTimeout(() => updateRow(idx, { open: false }), 150)
                        }
                        placeholder="Ketik kode / nama item..."
                        className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                      />
                      {options.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 glass rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                          {options.map((it) => (
                            <button
                              key={it.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                updateRow(idx, {
                                  item: it,
                                  query: "",
                                  open: false,
                                });
                              }}
                              className="w-full text-left px-3 py-2 text-[13px] hover:bg-white/60 flex gap-2"
                            >
                              <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                                {it.kode}
                              </span>
                              <span className="truncate">{it.nama}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  {idx === 0 && (
                    <label className="block text-[11.5px] text-muted mb-1">
                      Qty {row.item ? `(${row.item.satuan})` : ""}
                    </label>
                  )}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.qty}
                    onChange={(e) => updateRow(idx, { qty: e.target.value })}
                    placeholder="0"
                    className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </div>

                <div>
                  {idx === 0 && (
                    <label className="block text-[11.5px] text-muted mb-1">
                      Harga / Unit (Rp)
                    </label>
                  )}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.harga}
                    onChange={(e) => updateRow(idx, { harga: e.target.value })}
                    placeholder="0"
                    className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                </div>

                <div>
                  {idx === 0 && (
                    <label className="block text-[11.5px] text-muted mb-1">Subtotal</label>
                  )}
                  <div className="px-1 py-2.5 text-[13px] text-right whitespace-nowrap">
                    {rowSubtotal > 0 ? formatRupiah(rowSubtotal) : "—"}
                  </div>
                </div>

                <div className={idx === 0 ? "pt-[22px]" : ""}>
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) =>
                        rs.length > 1 ? rs.filter((_, i) => i !== idx) : [emptyRow()]
                      )
                    }
                    className="text-muted hover:text-clay-600 p-2"
                    title="Hapus baris"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-2 sm:max-w-sm sm:ml-auto sm:w-full">
        <div className="flex justify-between text-[13.5px]">
          <span className="text-muted">Subtotal</span>
          <span>{formatRupiah(subtotal)}</span>
        </div>
        <div className="flex justify-between items-center text-[13.5px]">
          <span className="text-muted flex items-center gap-1.5">
            PPN
            <input
              type="text"
              inputMode="decimal"
              value={ppn}
              onChange={(e) => setPpn(e.target.value)}
              className="w-14 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
            %
          </span>
          <span>{formatRupiah(ppnValue)}</span>
        </div>
        <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
          <span>Total</span>
          <span>{formatRupiah(total)}</span>
        </div>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading || deleting}
          className="flex-1 bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
        >
          {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan PO"}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || deleting}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-clay-600 border border-clay-500/40 hover:bg-clay-100 transition-colors disabled:opacity-60"
          >
            {deleting ? "Menghapus..." : "Hapus PO"}
          </button>
        )}
      </div>
    </form>
  );
}
