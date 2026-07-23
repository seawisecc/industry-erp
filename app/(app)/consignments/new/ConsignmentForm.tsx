"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createConsignment } from "../actions";
import type { ClientOpt, ProductVariantOpt } from "@/lib/salesOptions";

type Row = { key: string; qty: string; harga: string };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function ConsignmentForm({
  clients,
  options,
}: {
  clients: ClientOpt[];
  options: ProductVariantOpt[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState<Row[]>([{ key: "", qty: "", harga: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const optOf = (key: string) => options.find((o) => o.key === key);

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await createConsignment({
        client_id: clientId,
        tanggal_kirim: tanggal,
        catatan: catatan || null,
        items: rows
          .filter((r) => r.key)
          .map((r) => {
            const o = optOf(r.key)!;
            return {
              product_id: o.product_id,
              varian_ukuran: o.varian === "-" ? null : o.varian,
              qty_kirim: parseNum(r.qty),
              harga_jual: parseNum(r.harga),
            };
          }),
      });
      if (result.ok) {
        router.push("/consignments");
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Client (Lokasi Konsinyasi)
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className={inputCls}
          >
            <option value="">— Pilih client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kode} — {c.company_brand}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Tanggal Kirim
          </label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Catatan <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Produk yang Dikirim
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Harga jual per pcs jadi dasar proforma saat barang laku.
            </p>
          </div>
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
          const over = o && parseNum(row.qty) > o.available;
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_160px_32px] gap-2 items-center">
                <select
                  value={row.key}
                  onChange={(e) => {
                    const opt = options.find((o) => o.key === e.target.value);
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
                      {opt.label} · stok {opt.available.toLocaleString("id-ID")}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.qty}
                  onChange={(e) => updateRow(idx, { qty: e.target.value })}
                  placeholder="Qty pcs"
                  className={`${inputCls} ${over ? "ring-2 ring-clay-500" : ""}`}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.harga}
                  onChange={(e) => updateRow(idx, { harga: e.target.value })}
                  placeholder="Harga jual/pcs"
                  className={inputCls}
                />
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
                  Melebihi stok tersedia ({o!.available.toLocaleString("id-ID")} pcs)
                </p>
              )}
            </div>
          );
        })}
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
        {loading ? "Menyimpan..." : "Kirim Konsinyasi"}
      </button>
    </form>
  );
}
