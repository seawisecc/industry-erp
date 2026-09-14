"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createMaterial, updateMaterial, type InciRow } from "./actions";
import { useConfirmSave } from "@/components/ConfirmSave";
import { enterKeFieldBerikutnya, klasSorot, tombolCombo } from "@/lib/keyboard";
import NumberInput from "@/components/NumberInput";
import { keTampilan } from "@/lib/angka";

type SupplierOption = { id: string; nama: string };
type InciOption = { id: string; inci_name: string; cas_number: string | null };

/**
 * Angka yang sedang BERLAKU untuk material ini, dihitung di server.
 *
 * Dikirim ke form supaya kolom harga & MOQ tidak pernah jadi isian yang
 * diam-diam tidak berpengaruh: kalau bahannya sudah pernah dibeli atau
 * sudah punya item stok, layar bilang angka mana yang dipakai sistem
 * dan dari mana asalnya.
 */
export type BerlakuSekarang = {
  /** material ini sudah punya item stok */
  adaItem: boolean;
  /** harga pembelian terakhir, null bila belum pernah dibeli */
  hargaPembelian: number | null;
  /** MOQ yang tersimpan di item stok, null bila belum diisi di sana */
  moqItem: number | null;
  /** nama item stoknya apa adanya, untuk tahu apakah masih ikut tradename */
  namaItem: string | null;
  /** kode item stoknya, dipakai menunjuk barisnya di menu Stock Items */
  kodeItem: string | null;
  /** satuan item, untuk menulis "Rp x/kg" dengan benar */
  satuan: string | null;
};

type Props = {
  suppliers: SupplierOption[];
  inciOptions: InciOption[];
  berlaku?: BerlakuSekarang;
  material?: {
    id: string;
    material_code: string;
    tradename: string;
    supplier_id: string | null;
    origin: string | null;
    noc: string | null;
    kategori: "Bahan Baku" | "Kemasan";
    keterangan: string | null;
    harga_referensi: number | null;
    moq: number | null;
    inci_rows: InciRow[];
  };
};

type RowState = { inci_master_id: string; inci_name: string; percentage: string };

/** NILAI (titik desimal) dari NumberInput jadi angka, null bila kosong. */
function keAngka(nilai: string): number | null {
  const n = parseFloat(nilai.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function MaterialForm({
  suppliers,
  inciOptions,
  material,
  berlaku,
}: Props) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const isEdit = !!material;

  /* Nama item stok ikut tradename hanya selama gudang belum menamainya
     sendiri. Dibandingkan dengan tradename yang TERSIMPAN, bukan yang
     sedang diketik, supaya keterangannya tidak berkedip tiap huruf. */
  const namaItemIkut =
    (berlaku?.namaItem ?? "").trim().toLowerCase() ===
    (material?.tradename ?? "").trim().toLowerCase();

  const [materialCode, setMaterialCode] = useState(material?.material_code || "");
  const [tradename, setTradename] = useState(material?.tradename || "");
  const [supplierId, setSupplierId] = useState(material?.supplier_id || "");
  const [kategori, setKategori] = useState<"Bahan Baku" | "Kemasan">(material?.kategori || "Bahan Baku");
  const [keterangan, setKeterangan] = useState(material?.keterangan || "");
  const [origin, setOrigin] = useState(material?.origin || "");
  const [noc, setNoc] = useState(material?.noc || "");
  const [hargaRef, setHargaRef] = useState(
    material?.harga_referensi == null ? "" : String(material.harga_referensi)
  );
  const [moq, setMoq] = useState(
    material?.moq == null ? "" : String(material.moq)
  );
  const [rows, setRows] = useState<RowState[]>(
    material?.inci_rows?.length
      ? material.inci_rows.map((r) => ({ ...r, percentage: String(r.percentage) }))
      : [{ inci_master_id: "", inci_name: "", percentage: "" }]
  );
  const [activeSearch, setActiveSearch] = useState<number | null>(null);
  const [sorot, setSorot] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalPct = rows.reduce((s, r) => s + (parseFloat(r.percentage.replace(",", ".")) || 0), 0);
  const pctWarning = Math.abs(totalPct - 100) > 0.01 && rows.some((r) => r.inci_name);

  function updateRow(index: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { inci_master_id: "", inci_name: "", percentage: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: isEdit ? "Simpan perubahan material ini?" : "Tambah material baru?",
      ringkasan: [
        { label: "Kode", nilai: materialCode },
        { label: "Tradename", nilai: tradename },
        { label: "Kategori", nilai: kategori },
        /* Akibat yang menyentuh layar LAIN ditulis di dialognya, bukan
           cuma di keterangan kolom: orang yang menyimpan material sedang
           tidak melihat menu Stock Items, dan nama di sana ikut berubah. */
        ...(berlaku?.adaItem &&
        namaItemIkut &&
        tradename.trim() !== (material?.tradename ?? "").trim()
          ? [
              {
                label: "Nama item stok",
                nilai: `ikut berubah jadi "${tradename.trim()}"`,
              },
            ]
          : []),
        ...(hargaRef.trim()
          ? [{ label: "Harga Referensi", nilai: `Rp ${keTampilan(hargaRef)}` }]
          : []),
        ...(moq.trim() ? [{ label: "MOQ", nilai: keTampilan(moq) }] : []),
        ...(kategori === "Kemasan"
          ? []
          : [
              {
                label: "Komposisi INCI",
                nilai:
                  rows.filter((r) => r.inci_name.trim()).length + " baris",
              },
            ]),
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const payload = {
        material_code: materialCode,
        tradename,
        supplier_id: supplierId || null,
        origin: origin || null,
        noc: noc || null,
        kategori,
        keterangan: kategori === "Kemasan" ? keterangan || null : null,
        harga_referensi: hargaRef.trim() ? keAngka(hargaRef) : null,
        moq: moq.trim() ? keAngka(moq) : null,
        inci_rows:
          kategori === "Kemasan"
            ? []
            : rows.map((r) => ({
                inci_master_id: r.inci_master_id,
                inci_name: r.inci_name,
                percentage: parseFloat(r.percentage.replace(",", ".")) || 0,
              })),
      };
      const result =
        isEdit && material
          ? await updateMaterial(material.id, payload)
          : await createMaterial(payload);
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.push("/materials");
      router.refresh();
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={enterKeFieldBerikutnya} className="glass rounded-2xl p-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Kode Material</label>
          <input
            value={materialCode}
            onChange={(e) => setMaterialCode(e.target.value)}
            required
            placeholder="RM001-Sd.ME / PK001-..."
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Tradename</label>
          <input
            value={tradename}
            onChange={(e) => setTradename(e.target.value)}
            required
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
      </div>

      {/* Kolom yang menulis ke tempat LAIN harus mengatakannya, alasan
          yang sama dengan baris "Berlaku sekarang" di bawah harga & MOQ:
          isian yang diam-diam mengubah layar lain sama menyesatkannya
          dengan isian yang diam-diam tidak berpengaruh. */}
      {berlaku?.adaItem && (
        <p className="text-muted text-[11.5px] -mt-1 leading-snug">
          {namaItemIkut ? (
            <>
              Material ini sudah punya item stok
              {berlaku.kodeItem ? ` (${berlaku.kodeItem})` : ""}. Kode dan nama
              di atas ikut tertulis ke item itu waktu disimpan, supaya satu
              bahan tidak punya dua nama. Stok, HPP, dan dokumen lamanya tidak
              bergerak: mutasi bahan menyimpan id itemnya, bukan namanya.
            </>
          ) : (
            <>
              Item stoknya sudah dinamai sendiri di gudang:{" "}
              <span className="text-ink font-medium">{berlaku.namaItem}</span>
              {berlaku.kodeItem ? ` (${berlaku.kodeItem})` : ""}. Nama itu
              dibiarkan apa adanya, cuma kodenya yang ikut kode material. Kalau
              mau disamakan, ganti namanya di menu Stock Items.
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Kategori</label>
          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value as "Bahan Baku" | "Kemasan")}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          >
            <option value="Bahan Baku">Bahan Baku</option>
            <option value="Kemasan">Kemasan</option>
          </select>
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          >
            <option value="">- Pilih Supplier -</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.nama}</option>
            ))}
          </select>
        </div>
      </div>

      {kategori === "Bahan Baku" ? (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12.5px] font-medium text-muted">INCI Name & Komposisi (%)</label>
            <span className={`text-[12px] font-medium ${pctWarning ? "text-clay-600" : "text-botanical-700"}`}>
              Total: {totalPct.toFixed(2)}%{pctWarning ? " (idealnya 100%)" : ""}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const query = row.inci_name.toLowerCase();
              const filtered =
                activeSearch === i && query && !row.inci_master_id
                  ? inciOptions.filter((o) => o.inci_name.toLowerCase().includes(query)).slice(0, 8)
                  : [];
              return (
                <div key={i} className="relative flex items-start gap-2">
                  <div className="flex-1 relative">
                    <input
                      value={row.inci_name}
                      onChange={(e) => {
                        updateRow(i, { inci_name: e.target.value, inci_master_id: "" });
                        setActiveSearch(i);
                        setSorot(0);
                      }}
                      onFocus={() => {
                        setActiveSearch(i);
                        setSorot(0);
                      }}
                      onBlur={() => setTimeout(() => setActiveSearch(null), 150)}
                      onKeyDown={(e) =>
                        tombolCombo(e, {
                          jumlah: filtered.length,
                          sorot,
                          setSorot,
                          buka: activeSearch === i,
                          setBuka: (b) => setActiveSearch(b ? i : null),
                          pilih: (n) => {
                            const o = filtered[n];
                            updateRow(i, {
                              inci_master_id: o.id,
                              inci_name: o.inci_name,
                            });
                            setActiveSearch(null);
                          },
                        })
                      }
                      placeholder="Ketik untuk cari INCI Name..."
                      role="combobox"
                      aria-expanded={activeSearch === i}
                      aria-controls={`daftar-inci-${i}`}
                      className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                    />
                    {filtered.length > 0 && (
                      <div
                        role="listbox"
                        id={`daftar-inci-${i}`}
                        className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto"
                      >
                        {filtered.map((o, n) => (
                          <button
                            key={o.id}
                            type="button"
                            role="option"
                            aria-selected={n === sorot}
                            tabIndex={-1}
                            data-sorot={n === sorot ? "true" : undefined}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateRow(i, { inci_master_id: o.id, inci_name: o.inci_name });
                              setActiveSearch(null);
                            }}
                            onMouseEnter={() => setSorot(n)}
                            className={`w-full text-left px-3 py-2 text-[13px] flex justify-between gap-2 ${klasSorot(
                              n === sorot
                            )}`}
                          >
                            <span>{o.inci_name}</span>
                            <span className="text-muted text-[11.5px]">{o.cas_number || ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <NumberInput
                    value={row.percentage}
                    onChange={(nilai) => updateRow(i, { percentage: nilai })}
                    placeholder="%"
                    className="w-24 glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="p-2.5 text-muted hover:text-clay-600 transition-colors"
                    title="Hapus baris"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-botanical-700 hover:underline"
          >
            <Plus size={14} /> Tambah Komponen INCI
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Keterangan Kemasan
          </label>
          <textarea
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            rows={3}
            placeholder="Spesifikasi: jenis plastik (PET/HDPE), ukuran, warna, food grade, dst"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Origin</label>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Indonesia / China / dst"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">NOC (Natural Origin Content)</label>
          <input
            value={noc}
            onChange={(e) => setNoc(e.target.value)}
            placeholder="Misal: 98%"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
      </div>

      {/* ============ HARGA & MOQ ============

          Dua angka SUPPLIER, bukan angka gudang. Diketahui sejak
          penawaran pertama, jauh sebelum barangnya masuk, jadi tempatnya
          memang di master material.

          Yang nyata menang atas yang diketik: begitu bahannya pernah
          dibeli, harga pembelian yang dipakai; begitu materialnya punya
          item stok, MOQ item yang dipakai. Kalimat "berlaku sekarang" di
          bawah tiap kolom yang mengatakan itu, supaya tidak ada isian
          yang diam-diam tidak berpengaruh. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Harga Referensi{" "}
            <span className="text-muted font-normal">(per satuan, tanpa PPN)</span>
          </label>
          <NumberInput
            value={hargaRef}
            onChange={setHargaRef}
            placeholder="Harga penawaran supplier"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
          <p className="text-muted text-[11.5px] mt-1 leading-snug">
            {berlaku?.hargaPembelian != null ? (
              <>
                Berlaku sekarang:{" "}
                <span className="text-ink font-medium">
                  Rp {berlaku.hargaPembelian.toLocaleString("id-ID")}
                  {berlaku.satuan ? `/${berlaku.satuan}` : ""}
                </span>{" "}
                dari pembelian terakhir. Angka di atas cuma dipakai selama
                bahannya belum pernah dibeli.
              </>
            ) : (
              <>
                Belum pernah dibeli, jadi angka ini yang dipakai perkiraan biaya
                di R&amp;D. Isi tanpa PPN supaya sebanding dengan harga
                pembelian.
              </>
            )}
          </p>
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            MOQ <span className="text-muted font-normal">(minimum order)</span>
          </label>
          <NumberInput
            value={moq}
            onChange={setMoq}
            placeholder="Pembelian minimum dari supplier"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
          <p className="text-muted text-[11.5px] mt-1 leading-snug">
            {berlaku?.adaItem ? (
              <>
                Berlaku sekarang:{" "}
                <span className="text-ink font-medium">
                  {berlaku.moqItem == null
                    ? "belum diisi"
                    : `${berlaku.moqItem.toLocaleString("id-ID")}${
                        berlaku.satuan ? ` ${berlaku.satuan}` : ""
                      }`}
                </span>{" "}
                dari item stoknya, dan itu yang dipakai PPIC serta validasi PO.
                Ubah di menu Stock Items.
              </>
            ) : (
              <>
                Dipakai sebagai bawaan waktu material ini didaftarkan jadi item
                stok.
              </>
            )}
          </p>
        </div>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm mt-2 disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan"}
      </button>
      {konfirmasi.dialog}
    </form>
  );
}