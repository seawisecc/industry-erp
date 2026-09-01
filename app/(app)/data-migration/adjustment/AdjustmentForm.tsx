"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createStockAdjustment } from "./actions";
import DataTable from "@/components/DataTable";
import { useConfirmSave } from "@/components/ConfirmSave";
import { enterKeFieldBerikutnya } from "@/lib/keyboard";
import NumberInput from "@/components/NumberInput";

export type AdjustItem = {
  id: string;
  kode: string;
  nama: string;
  kategori: string;
  satuan: string;
  stok: number;
  lastHarga: number | null;
};

type Row = {
  qty: string;
  harga: string;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

function toStr(n: number | null | undefined) {
  return n == null ? "" : String(n);
}

function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function AdjustmentForm({ items }: { items: AdjustItem[] }) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();

  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [catatan, setCatatan] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      items.map((it) => [
        it.id,
        { qty: toStr(it.stok), harga: toStr(it.lastHarga) },
      ])
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(
      (it) =>
        it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q)
    );
  }, [items, query]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((rs) => ({ ...rs, [id]: { ...rs[id], ...patch } }));
  }

  /** Stok aktual - stok sistem; 0 kalau kolomnya belum diisi. */
  const selisihOf = (it: (typeof items)[number]) => {
    const row = rows[it.id];
    if (!row || row.qty === "") return 0;
    return parseNum(row.qty) - it.stok;
  };

  // Item yang berubah = qty aktual ≠ stok sistem
  const changed = items.filter((it) => {
    const row = rows[it.id];
    if (!row || row.qty === "") return false;
    return parseNum(row.qty) !== it.stok;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (changed.length === 0) {
      setError("Belum ada stok yang diubah, sesuaikan minimal satu item.");
      return;
    }
    const naikTanpaHarga = changed.find((it) => {
      const row = rows[it.id];
      return parseNum(row.qty) > it.stok && !row.harga;
    });
    if (naikTanpaHarga) {
      setError(
        `"${naikTanpaHarga.nama}" stoknya bertambah, isi harga/unit supaya nilai stok tercatat benar.`
      );
      return;
    }

    setLoading(true);
    setError("");

    const lanjut = await konfirmasi.minta({
      judul: "Simpan penyesuaian stok?",
      pesan: "Stok item yang diubah langsung mengikuti angka di layar ini.",
      ringkasan: [
        { label: "Tanggal", nilai: tanggal },
        { label: "Item Diubah", nilai: changed.length + " item" },
      ],
      tombol: "Ya, Sesuaikan Stok",
      nada: "bahaya",
    });
    if (!lanjut) return;

    try {
      const result = await createStockAdjustment({
        tanggal,
        catatan: catatan || null,
        items: changed.map((it) => ({
          item_id: it.id,
          qty_aktual: parseNum(rows[it.id].qty),
          harga: rows[it.id].harga ? parseNum(rows[it.id].harga) : null,
        })),
      });
      if (result.ok) {
        router.push("/data-migration/adjustment");
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
    "w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} onKeyDown={enterKeFieldBerikutnya} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Tanggal Adjustment
          </label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Catatan <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Misal: stock opname bulanan Juli / input stok awal"
            className={inputCls}
          />
        </div>
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Stok Seluruh Item
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Ubah kolom Stok Aktual sesuai hasil hitung fisik. Yang tidak diubah
              tidak akan disentuh.
            </p>
          </div>
          <div className="relative sm:w-[260px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode / nama item..."
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        <DataTable
          rows={filtered}
          rowKey={(it) => it.id}
          minWidth={720}
          expandable={false}
          rowClassName={(it) => (selisihOf(it) !== 0 ? "bg-amber-100/40" : "")}
          empty={
            items.length === 0
              ? "Belum ada item terdaftar."
              : "Tidak ada item yang cocok dengan pencarian."
          }
          columns={[
            {
              key: "item",
              header: "Item",
              role: "title",
              cell: (it) => (
                <>
                  <div className="font-medium">{it.nama}</div>
                  <div className="text-[11px] text-muted font-mono">
                    {it.kode} · {it.kategori}
                  </div>
                </>
              ),
              cardCell: (it) => (
                <>
                  <div>{it.nama}</div>
                  <div className="text-[11px] text-muted font-mono font-normal">
                    {it.kode} · {it.kategori}
                  </div>
                </>
              ),
            },
            {
              key: "sistem",
              header: "Stok Sistem",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (it) => `${formatId(it.stok)} ${it.satuan}`,
            },
            {
              key: "aktual",
              header: "Stok Aktual",
              role: "primary",
              headClassName: "w-[130px]",
              cell: (it) => (
                <NumberInput
                  aria-label={`Stok aktual ${it.nama}`}
                  value={rows[it.id]?.qty ?? ""}
                  onChange={(nilai) => updateRow(it.id, { qty: nilai })}
                  className={inputCls}
                />
              ),
            },
            {
              key: "harga",
              header: "Harga/Unit (Rp)",
              role: "primary",
              headClassName: "w-[150px]",
              cell: (it) => (
                <NumberInput
                  aria-label={`Harga per unit ${it.nama}`}
                  value={rows[it.id]?.harga ?? ""}
                  onChange={(nilai) => updateRow(it.id, { harga: nilai })}
                  placeholder="0"
                  className={inputCls}
                />
              ),
            },
            {
              key: "selisih",
              header: "Selisih",
              role: "primary",
              align: "right",
              cell: (it) => {
                const diff = selisihOf(it);
                return (
                  <span
                    className={`whitespace-nowrap font-medium ${
                      diff > 0
                        ? "text-botanical-700"
                        : diff < 0
                          ? "text-clay-600"
                          : "text-muted"
                    }`}
                  >
                    {diff === 0 ? "-" : `${diff > 0 ? "+" : ""}${formatId(diff)}`}
                  </span>
                );
              },
            },
          ]}
        />
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || changed.length === 0}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading
          ? "Menyimpan & menyesuaikan stok..."
          : changed.length === 0
            ? "Belum ada perubahan"
            : `Simpan Adjustment (${changed.length} item berubah)`}
      </button>
      {konfirmasi.dialog}
    </form>
  );
}
