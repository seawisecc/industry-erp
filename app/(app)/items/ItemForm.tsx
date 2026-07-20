"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createItem, updateItem } from "./actions";

type MaterialOption = {
  id: string;
  material_code: string;
  tradename: string;
  kategori: "Bahan Baku" | "Kemasan";
};

type Props = {
  materials: MaterialOption[];
  item?: {
    id: string;
    nama: string;
    kategori: "Bahan Baku" | "Kemasan";
    satuan: string;
    stok_minimum: number;
    moq: number | null;
    material_id: string | null;
  };
};

export default function ItemForm({ materials, item }: Props) {
  const router = useRouter();
  const isEdit = !!item;

  const initialMaterial = materials.find((m) => m.id === item?.material_id) || null;

  const [nama, setNama] = useState(item?.nama || "");
  const [namaDiketikManual, setNamaDiketikManual] = useState(isEdit);
  const [kategori, setKategori] = useState<"Bahan Baku" | "Kemasan">(
    item?.kategori || "Bahan Baku"
  );
  const [satuan, setSatuan] = useState(item?.satuan || "kg");
  const [stokMinimum, setStokMinimum] = useState(String(item?.stok_minimum ?? ""));
  const [moq, setMoq] = useState(item?.moq == null ? "" : String(item.moq));
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialOption | null>(
    initialMaterial
  );
  const [materialQuery, setMaterialQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Daftar material yang bisa dipilih mengikuti kategori item yang sedang dipilih
  const availableMaterials = materials.filter((m) => m.kategori === kategori);

  const filteredMaterials =
    searchOpen && materialQuery
      ? availableMaterials
          .filter(
            (m) =>
              m.tradename.toLowerCase().includes(materialQuery.toLowerCase()) ||
              m.material_code.toLowerCase().includes(materialQuery.toLowerCase())
          )
          .slice(0, 8)
      : [];

  function handleKategoriChange(next: "Bahan Baku" | "Kemasan") {
    setKategori(next);
    // Kalau material yang lagi kepilih beda kategori, lepas link-nya
    if (selectedMaterial && selectedMaterial.kategori !== next) {
      setSelectedMaterial(null);
      if (!namaDiketikManual) setNama("");
    }
    // Default satuan menyesuaikan: bahan baku biasanya kg, kemasan pcs
    if (!isEdit) {
      setSatuan(next === "Kemasan" ? "pcs" : "kg");
    }
  }

  function selectMaterial(m: MaterialOption) {
    setSelectedMaterial(m);
    setMaterialQuery("");
    setSearchOpen(false);
    if (!namaDiketikManual) {
      setNama(m.tradename);
    }
  }

  function clearMaterial() {
    setSelectedMaterial(null);
    if (!namaDiketikManual) {
      setNama("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const payload = {
        nama,
        kategori,
        satuan,
        stok_minimum: parseFloat(stokMinimum.replace(",", ".")) || 0,
        moq: moq.trim() ? parseFloat(moq.replace(",", ".")) || null : null,
        material_id: selectedMaterial?.id || null,
      };
      if (isEdit && item) {
        await updateItem(item.id, payload);
      } else {
        await createItem(payload);
      }
      router.push("/items");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan item");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Kategori</label>
          <select
            value={kategori}
            onChange={(e) => handleKategoriChange(e.target.value as "Bahan Baku" | "Kemasan")}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          >
            <option value="Bahan Baku">Bahan Baku</option>
            <option value="Kemasan">Kemasan</option>
          </select>
        </div>

        <div className="relative">
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Link ke Material (opsional)
          </label>
          {selectedMaterial ? (
            <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
              <span className="font-mono text-[12px] text-botanical-700">
                {selectedMaterial.material_code}
              </span>
              <span className="truncate flex-1">{selectedMaterial.tradename}</span>
              <button
                type="button"
                onClick={clearMaterial}
                className="text-muted hover:text-clay-600"
                title="Lepas link"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <input
                value={materialQuery}
                onChange={(e) => {
                  setMaterialQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                placeholder={`Ketik kode / tradename material ${kategori.toLowerCase()}...`}
                className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
              />
              {filteredMaterials.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                  {filteredMaterials.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectMaterial(m);
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-white/60 flex gap-2"
                    >
                      <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                        {m.material_code}
                      </span>
                      <span className="truncate">{m.tradename}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Nama Item{" "}
            <span className="font-normal text-muted/70">(nama sehari-hari di gudang)</span>
          </label>
          <input
            value={nama}
            onChange={(e) => {
              setNama(e.target.value);
              setNamaDiketikManual(e.target.value.length > 0);
            }}
            required
            placeholder="Misal: Botol PET 100ml / Ekstrak Centella"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Satuan</label>
          <input
            value={satuan}
            onChange={(e) => setSatuan(e.target.value)}
            required
            placeholder="kg / pcs / liter"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Stok Minimum (alert)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={stokMinimum}
            onChange={(e) => setStokMinimum(e.target.value)}
            placeholder="0"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            MOQ <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={moq}
            onChange={(e) => setMoq(e.target.value)}
            placeholder="Misal: 25"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
          <p className="text-[11px] text-muted mt-1">
            Qty PO wajib minimal MOQ &amp; kelipatannya
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
    </form>
  );
}