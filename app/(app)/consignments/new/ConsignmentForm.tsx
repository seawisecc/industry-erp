"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createConsignment } from "../actions";
import type { ClientOpt, ProductVariantOpt } from "@/lib/salesOptions";
import ClientPicker from "@/components/ClientPicker";
import ProductPicker from "@/components/ProductPicker";
import { clientPriceKey, type ClientPriceMap } from "@/lib/clientPrice";

/**
 * `hargaManual` menandai baris yang harganya sudah diketik user, supaya
 * tidak ikut tertimpa waktu client (outlet) diganti. Lihat catatan yang
 * sama di InvoiceForm.
 */
type Row = { key: string; qty: string; harga: string; hargaManual: boolean };

const BARIS_KOSONG: Row = { key: "", qty: "", harga: "", hargaManual: false };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function ConsignmentForm({
  clients,
  options,
  clientPrices,
}: {
  clients: ClientOpt[];
  options: ProductVariantOpt[];
  clientPrices: ClientPriceMap;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...BARIS_KOSONG }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const optOf = (key: string) => options.find((o) => o.key === key);

  /** Harga khusus outlet kalau ada, kalau tidak harga master produk. */
  function hargaUntuk(key: string, cid: string): number | null {
    const o = optOf(key);
    if (!o) return null;
    if (cid) {
      const khusus = clientPrices[clientPriceKey(cid, o.product_id, o.varian)];
      if (khusus != null) return khusus;
    }
    return o.harga_jual;
  }

  const punyaHargaKhusus = (key: string) => {
    const o = optOf(key);
    if (!o || !clientId) return false;
    return clientPrices[clientPriceKey(clientId, o.product_id, o.varian)] != null;
  };

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
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="relative z-40 glass rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Client (Lokasi Konsinyasi)
          </label>
          <ClientPicker
            clients={clients}
            value={clientId}
            onChange={gantiClient}
            placeholder="Ketik nama client..."
          />
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

      <div className="relative z-10 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
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
            onClick={() => setRows((rs) => [...rs, { ...BARIS_KOSONG }])}
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
                <ProductPicker
                  options={options}
                  value={row.key}
                  onChange={(key) => {
                    // Prefill harga: harga khusus outlet kalau ada,
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
                  onChange={(e) =>
                    updateRow(idx, { harga: e.target.value, hargaManual: true })
                  }
                  placeholder="Harga jual/pcs"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) =>
                      rs.length > 1
                        ? rs.filter((_, i) => i !== idx)
                        : [{ ...BARIS_KOSONG }]
                    )
                  }
                  className="text-muted hover:text-clay-600 p-2"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {punyaHargaKhusus(row.key) && !row.hargaManual && (
                <p className="text-botanical-700 text-[11.5px]">
                  Harga khusus outlet dipakai
                </p>
              )}
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
