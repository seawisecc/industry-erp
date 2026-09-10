"use client";

/* ============================================================
   Form develop formula R&D.

   Tiga hal yang membedakannya dari form Produk:

   - Persentase langsung diterjemahkan jadi TAKARAN TRIAL dalam gram
     di sebelah barisnya. Formulator bekerja dengan timbangan, bukan
     dengan persen, dan menghitung ulang 2,5% dari 500 g di kepala
     untuk dua puluh baris adalah cara paling gampang salah tuang.
   - Biaya ikut bergerak tiap angka diketik, karena keputusan
     "formula ini masuk akal atau tidak" hampir selalu soal harga
     satu dua bahan yang porsinya kecil.
   - Bahan yang dinonaktifkan tetap boleh dipilih. R&D justru sering
     menjajaki bahan yang sudah lama tidak dibeli, dan menyembunyikannya
     berarti formulanya disusun di luar sistem.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2, Wand2 } from "lucide-react";
import { saveRndFormula } from "./actions";
import { useConfirmSave } from "@/components/ConfirmSave";
import { enterKeFieldBerikutnya, klasSorot, tombolCombo } from "@/lib/keyboard";
import NumberInput from "@/components/NumberInput";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { specBawaan } from "@/lib/rnd";
import {
  hitungBiayaFormula,
  takaranTrial,
  type ItemRnd,
} from "@/lib/rndCost";
import { GRUP_SARAN } from "@/lib/qcParams";

type FRow = {
  item: ItemRnd | null;
  query: string;
  open: boolean;
  fase: string;
  pct: string;
  fungsi: string;
};

type SRow = {
  id?: string;
  grup: string;
  parameter: string;
  satuan: string;
  target: string;
};

type KRow = {
  item: ItemRnd | null;
  query: string;
  open: boolean;
  nama: string;
  qty: string;
  harga: string;
};

export type FormulaAwal = {
  id: string;
  nama_produk: string;
  brand: string | null;
  client_id: string | null;
  tanggal_develop: string;
  trial_gram: number | null;
  netto_gram: number | null;
  catatan: string | null;
  items: {
    item_id: string;
    fase: string | null;
    percentage: number;
    fungsi: string | null;
  }[];
  specs: {
    id: string;
    grup: string | null;
    parameter: string;
    satuan: string | null;
    target: string | null;
  }[];
  packaging: {
    item_id: string | null;
    nama: string | null;
    qty_per_pcs: number;
    harga_estimasi: number | null;
  }[];
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function toStr(n: number | null | undefined) {
  return n == null ? "" : String(n);
}
function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function angka(n: number, desimal = 2) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: desimal });
}

function barisFormulaKosong(): FRow {
  return { item: null, query: "", open: false, fase: "", pct: "", fungsi: "" };
}
function barisKemasanKosong(): KRow {
  return { item: null, query: "", open: false, nama: "", qty: "1", harga: "" };
}

export default function RndForm({
  items,
  clients,
  hariIni,
  formula,
}: {
  items: ItemRnd[];
  clients: ClientOption[];
  /** tanggal kalender zona operasional, dihitung di server */
  hariIni: string;
  formula?: FormulaAwal;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const isEdit = !!formula;

  const itemOf = (id: string) => items.find((i) => i.id === id);
  const bahanBaku = items.filter((i) => i.kategori === "Bahan Baku");
  const kemasan = items.filter((i) => i.kategori === "Kemasan");

  const [sorotF, setSorotF] = useState(0);
  const [sorotK, setSorotK] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [nama, setNama] = useState(formula?.nama_produk || "");
  const [brand, setBrand] = useState(formula?.brand || "");
  const [clientId, setClientId] = useState(formula?.client_id || "");
  const [tanggal, setTanggal] = useState(formula?.tanggal_develop || hariIni);
  const [trialGram, setTrialGram] = useState(toStr(formula?.trial_gram) || "500");
  const [nettoGram, setNettoGram] = useState(toStr(formula?.netto_gram));
  const [catatan, setCatatan] = useState(formula?.catatan || "");

  const [fRows, setFRows] = useState<FRow[]>(() => {
    if (!formula || formula.items.length === 0) return [barisFormulaKosong()];
    return formula.items.map((f) => ({
      item: items.find((i) => i.id === f.item_id) || null,
      query: "",
      open: false,
      fase: f.fase || "",
      pct: toStr(f.percentage),
      fungsi: f.fungsi || "",
    }));
  });

  const [sRows, setSRows] = useState<SRow[]>(() => {
    if (!formula) {
      return specBawaan().map((s) => ({
        grup: s.grup || "",
        parameter: s.parameter,
        satuan: s.satuan || "",
        target: s.target || "",
      }));
    }
    return formula.specs.map((s) => ({
      id: s.id,
      grup: s.grup || "",
      parameter: s.parameter,
      satuan: s.satuan || "",
      target: s.target || "",
    }));
  });

  const [kRows, setKRows] = useState<KRow[]>(() => {
    if (!formula || formula.packaging.length === 0) return [barisKemasanKosong()];
    return formula.packaging.map((p) => ({
      item: p.item_id ? items.find((i) => i.id === p.item_id) || null : null,
      query: "",
      open: false,
      nama: p.nama || "",
      qty: toStr(p.qty_per_pcs),
      harga: toStr(p.harga_estimasi),
    }));
  });

  /* ---------------- Formula ---------------- */

  function updateF(idx: number, patch: Partial<FRow>) {
    setFRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const dipakai = fRows.map((r) => r.item?.id).filter(Boolean);
  const totalPct = fRows.reduce((s, r) => s + (r.item ? parseNum(r.pct) : 0), 0);

  function saranBahan(row: FRow) {
    if (!row.open) return [];
    const q = row.query.toLowerCase();
    return bahanBaku
      .filter((it) => !dipakai.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) =>
          !q ||
          it.nama.toLowerCase().includes(q) ||
          it.kode.toLowerCase().includes(q) ||
          (it.supplier || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  /* ---------------- Kemasan ---------------- */

  function updateK(idx: number, patch: Partial<KRow>) {
    setKRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function saranKemasan(row: KRow) {
    if (!row.open) return [];
    const q = row.query.toLowerCase();
    return kemasan
      .filter(
        (it) =>
          !q ||
          it.nama.toLowerCase().includes(q) ||
          it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  /* ---------------- Spek ---------------- */

  function updateS(idx: number, patch: Partial<SRow>) {
    setSRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  /* ---------------- Angka turunan ---------------- */

  const barisFormula = fRows
    .filter((r) => r.item)
    .map((r) => ({ item_id: r.item!.id, percentage: parseNum(r.pct) }));

  const barisKemasan = kRows
    .filter((r) => r.item || r.nama.trim())
    .map((r) => ({
      item_id: r.item?.id ?? null,
      nama: r.item ? null : r.nama.trim(),
      qty_per_pcs: parseNum(r.qty),
      // Kemasan yang sudah ada di master memakai harga pembeliannya, jadi
      // angka ketikan tidak ikut disimpan: dua sumber harga untuk satu
      // baris adalah cara paling gampang membuat layar dan laporan beda.
      harga_estimasi: r.item ? null : r.harga ? parseNum(r.harga) : null,
    }));

  const netto = nettoGram ? parseNum(nettoGram) : null;
  const biaya = hitungBiayaFormula(barisFormula, barisKemasan, netto, itemOf);
  const takaran = takaranTrial(barisFormula, trialGram ? parseNum(trialGram) : null);

  /* ---------------- Simpan ---------------- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (barisFormula.filter((b) => b.percentage > 0).length === 0) {
      setError("Formula harus punya minimal satu bahan dengan persentase lebih dari 0");
      return;
    }

    const lanjut = await konfirmasi.minta({
      judul: isEdit ? "Simpan perubahan formula ini?" : "Simpan formula develop baru?",
      pesan: isEdit
        ? "Bahan, spesifikasi target, dan rencana kemasan ditulis ulang seluruhnya sesuai isi layar ini."
        : "Nomor formula dibuat otomatis saat disimpan.",
      ringkasan: [
        { label: "Nama Produk", nilai: nama || "-" },
        { label: "Brand", nilai: brand || "-" },
        { label: "Bahan", nilai: `${barisFormula.length} bahan · total ${angka(totalPct)}%` },
        { label: "Spek Target", nilai: `${sRows.filter((s) => s.parameter.trim()).length} parameter` },
        {
          label: "Biaya per pcs",
          nilai: biaya.totalPerPcs == null ? "belum ada gramasi" : rupiah(biaya.totalPerPcs),
        },
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const hasil = await saveRndFormula(
        formula?.id ?? null,
        {
          nama_produk: nama.trim(),
          brand: brand.trim() || null,
          client_id: clientId || null,
          tanggal_develop: tanggal,
          trial_gram: trialGram ? parseNum(trialGram) : null,
          netto_gram: netto,
          catatan: catatan.trim() || null,
        },
        fRows
          .filter((r) => r.item)
          .map((r) => ({
            item_id: r.item!.id,
            fase: r.fase.trim() || null,
            percentage: parseNum(r.pct),
            fungsi: r.fungsi.trim() || null,
            catatan: null,
          })),
        sRows
          .filter((s) => s.parameter.trim())
          .map((s, i) => ({
            id: s.id,
            urutan: i,
            grup: s.grup.trim() || null,
            parameter: s.parameter.trim(),
            satuan: s.satuan.trim() || null,
            target: s.target.trim() || null,
            hasil: null,
          })),
        barisKemasan
      );

      if (!hasil.ok) {
        setError(hasil.error);
        setLoading(false);
        return;
      }
      router.push(`/rnd/${hasil.id}`);
      router.refresh();
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah, muat ulang halaman lalu coba lagi."
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
      {/* ============ INFO DEVELOP ============ */}
      <div className="relative z-40 glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Nama Produk <span className="text-clay-600">*</span>
            </label>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
              placeholder="mis. Serum Niacinamide 10%"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Brand <span className="text-muted font-normal">(opsional)</span>
            </label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Brand pemilik produk"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Client <span className="text-muted font-normal">(opsional)</span>
            </label>
            <ClientPicker
              clients={clients}
              value={clientId}
              onChange={setClientId}
              allowEmpty
              emptyLabel="Tanpa client (produk sendiri)"
              placeholder="Ketik nama client..."
            />
          </div>
          <div>
            <label className={labelCls}>
              Tanggal Develop <span className="text-clay-600">*</span>
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              required
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Ukuran Batch Trial (gram)</label>
            <NumberInput
              value={trialGram}
              onChange={setTrialGram}
              placeholder="500"
              className={inputCls}
            />
            <p className="text-muted text-[11.5px] mt-1">
              Dipakai lembar kerja lab: takaran tiap bahan dihitung dari angka ini.
            </p>
          </div>
          <div>
            <label className={labelCls}>Gramasi Produk per pcs (gram)</label>
            <NumberInput
              value={nettoGram}
              onChange={setNettoGram}
              placeholder="mis. 30"
              className={inputCls}
            />
            <p className="text-muted text-[11.5px] mt-1">
              Netto satu kemasan. Tanpa ini biaya per pcs tidak bisa dihitung.
            </p>
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Brief / Catatan Develop{" "}
            <span className="text-muted font-normal">(opsional)</span>
          </label>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            placeholder="Target tekstur, klaim, acuan produk pembanding..."
            className={inputCls}
          />
        </div>
      </div>

      {/* ============ FORMULA ============ */}
      <div className="relative z-30 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Formula Bahan Baku (%)
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Persentase terhadap total ruahan. Takaran trial dihitung otomatis
              dari ukuran batch di atas.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span
              className={`text-[12.5px] font-medium px-2 py-0.5 rounded-full ${
                Math.abs(totalPct - 100) < 0.01
                  ? "bg-botanical-100 text-botanical-700"
                  : "bg-amber-100 text-amber-500"
              }`}
            >
              Total {angka(totalPct)}%
            </span>
            <button
              type="button"
              onClick={() => setFRows((rs) => [...rs, barisFormulaKosong()])}
              className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
            >
              <Plus size={14} /> Tambah
            </button>
          </div>
        </div>

        {fRows.map((row, idx) => {
          const options = saranBahan(row);
          const gram = row.item ? takaran.get(row.item.id) : undefined;
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_64px_100px_160px_32px] gap-2 items-start">
                <div className="relative">
                  {row.item ? (
                    <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                      <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                        {row.item.kode}
                      </span>
                      <span className="truncate flex-1">{row.item.nama}</span>
                      <button
                        type="button"
                        onClick={() => updateF(idx, { item: null, query: "" })}
                        className="text-muted hover:text-clay-600 flex-shrink-0"
                        aria-label="Hapus pilihan bahan"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={row.query}
                        onChange={(e) => {
                          updateF(idx, { query: e.target.value, open: true });
                          setSorotF(0);
                        }}
                        onFocus={() => {
                          updateF(idx, { open: true });
                          setSorotF(0);
                        }}
                        onBlur={() =>
                          setTimeout(() => updateF(idx, { open: false }), 150)
                        }
                        onKeyDown={(e) =>
                          tombolCombo(e, {
                            jumlah: options.length,
                            sorot: sorotF,
                            setSorot: setSorotF,
                            buka: !!row.open,
                            setBuka: (b) => updateF(idx, { open: b }),
                            pilih: (i) =>
                              updateF(idx, {
                                item: options[i],
                                query: "",
                                open: false,
                              }),
                          })
                        }
                        placeholder="Ketik kode / nama / supplier bahan..."
                        role="combobox"
                        aria-expanded={!!row.open}
                        aria-controls={`daftar-bahan-${idx}`}
                        className={inputCls}
                      />
                      {options.length > 0 && (
                        <div
                          id={`daftar-bahan-${idx}`}
                          role="listbox"
                          className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-60 overflow-y-auto"
                        >
                          {options.map((it, i) => (
                            <button
                              key={it.id}
                              type="button"
                              role="option"
                              aria-selected={i === sorotF}
                              tabIndex={-1}
                              data-sorot={
                                row.open && i === sorotF ? "true" : undefined
                              }
                              onMouseDown={(e) => {
                                e.preventDefault();
                                updateF(idx, {
                                  item: it,
                                  query: "",
                                  open: false,
                                });
                              }}
                              onMouseEnter={() => setSorotF(i)}
                              className={`w-full text-left px-3 py-2 text-[13px] ${klasSorot(
                                i === sorotF
                              )}`}
                            >
                              <div className="flex gap-2">
                                <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                                  {it.kode}
                                </span>
                                <span className="truncate">{it.nama}</span>
                              </div>
                              <div className="text-muted text-[11px] mt-0.5 truncate">
                                {it.harga == null
                                  ? "belum pernah dibeli"
                                  : `${rupiah(it.harga)}/${it.satuan}`}
                                {it.supplier ? ` · ${it.supplier}` : ""}
                                {` · stok ${angka(it.stok, 3)} ${it.satuan}`}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <input
                  value={row.fase}
                  onChange={(e) => updateF(idx, { fase: e.target.value })}
                  placeholder="Fase"
                  title="Fase (A/B/C, opsional)"
                  className={`${inputCls} text-center`}
                />

                <div className="relative">
                  <NumberInput
                    value={row.pct}
                    onChange={(nilai) => updateF(idx, { pct: nilai })}
                    placeholder="0"
                    className={`${inputCls} pr-7`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[12.5px]">
                    %
                  </span>
                </div>

                <input
                  value={row.fungsi}
                  onChange={(e) => updateF(idx, { fungsi: e.target.value })}
                  placeholder="Fungsi (opsional)"
                  className={inputCls}
                />

                <button
                  type="button"
                  onClick={() =>
                    setFRows((rs) =>
                      rs.length > 1
                        ? rs.filter((_, i) => i !== idx)
                        : [barisFormulaKosong()]
                    )
                  }
                  className="text-muted hover:text-clay-600 p-2"
                  aria-label="Hapus baris bahan"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {row.item && (
                <div className="text-[11.5px] text-muted pl-0.5">
                  {gram != null && gram > 0
                    ? `Takaran trial ${angka(gram, 3)} g`
                    : "Takaran trial belum bisa dihitung"}
                  {row.item.harga != null
                    ? ` · ${rupiah(row.item.harga)}/${row.item.satuan}`
                    : " · belum punya acuan harga"}
                  {row.item.supplier ? ` · ${row.item.supplier}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============ SPEK TARGET ============ */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Spesifikasi Target
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Parameternya sama dengan master QC produk jadi, supaya yang
              ditargetkan di sini memang yang diuji nanti.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() =>
                setSRows(
                  specBawaan().map((s) => ({
                    grup: s.grup || "",
                    parameter: s.parameter,
                    satuan: s.satuan || "",
                    target: s.target || "",
                  }))
                )
              }
              className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
            >
              <Wand2 size={14} /> Isi Parameter Standar
            </button>
            <button
              type="button"
              onClick={() =>
                setSRows((rs) => [
                  ...rs,
                  { grup: "", parameter: "", satuan: "", target: "" },
                ])
              }
              className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
            >
              <Plus size={14} /> Tambah
            </button>
          </div>
        </div>

        {sRows.length === 0 && (
          <p className="text-muted text-[12.5px]">
            Belum ada parameter. Tekan Isi Parameter Standar untuk memakai daftar
            baku produk jadi.
          </p>
        )}

        {sRows.map((row, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-[150px_1fr_100px_1fr_32px] gap-2 items-start"
          >
            <input
              value={row.grup}
              onChange={(e) => updateS(idx, { grup: e.target.value })}
              placeholder="Grup"
              list="rnd-grup-saran"
              className={inputCls}
            />
            <input
              value={row.parameter}
              onChange={(e) => updateS(idx, { parameter: e.target.value })}
              placeholder="Parameter"
              className={inputCls}
            />
            <input
              value={row.satuan}
              onChange={(e) => updateS(idx, { satuan: e.target.value })}
              placeholder="Satuan"
              className={inputCls}
            />
            <input
              value={row.target}
              onChange={(e) => updateS(idx, { target: e.target.value })}
              placeholder="Target / spesifikasi"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setSRows((rs) => rs.filter((_, i) => i !== idx))}
              className="text-muted hover:text-clay-600 p-2"
              aria-label="Hapus parameter"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <datalist id="rnd-grup-saran">
          {GRUP_SARAN.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      {/* ============ KEMASAN ============ */}
      <div className="relative z-20 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Rencana Kemasan per pcs
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Kemasan yang belum ada di master boleh diketik namanya saja,
              harganya diisi tangan sebagai perkiraan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setKRows((rs) => [...rs, barisKemasanKosong()])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah
          </button>
        </div>

        {kRows.map((row, idx) => {
          const options = saranKemasan(row);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[1fr_90px_140px_32px] gap-2 items-start"
            >
              <div className="relative">
                {row.item ? (
                  <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                    <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                      {row.item.kode}
                    </span>
                    <span className="truncate flex-1">{row.item.nama}</span>
                    <button
                      type="button"
                      onClick={() => updateK(idx, { item: null, query: "" })}
                      className="text-muted hover:text-clay-600 flex-shrink-0"
                      aria-label="Hapus pilihan kemasan"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={row.query || row.nama}
                      onChange={(e) => {
                        updateK(idx, {
                          query: e.target.value,
                          nama: e.target.value,
                          open: true,
                        });
                        setSorotK(0);
                      }}
                      onFocus={() => {
                        updateK(idx, { open: true });
                        setSorotK(0);
                      }}
                      onBlur={() =>
                        setTimeout(() => updateK(idx, { open: false }), 150)
                      }
                      onKeyDown={(e) =>
                        tombolCombo(e, {
                          jumlah: options.length,
                          sorot: sorotK,
                          setSorot: setSorotK,
                          buka: !!row.open,
                          setBuka: (b) => updateK(idx, { open: b }),
                          pilih: (i) =>
                            updateK(idx, {
                              item: options[i],
                              query: "",
                              nama: "",
                              open: false,
                            }),
                        })
                      }
                      placeholder="Pilih dari master, atau ketik nama kemasan baru"
                      role="combobox"
                      aria-expanded={!!row.open}
                      aria-controls={`daftar-kemasan-${idx}`}
                      className={inputCls}
                    />
                    {options.length > 0 && (
                      <div
                        id={`daftar-kemasan-${idx}`}
                        role="listbox"
                        className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto"
                      >
                        {options.map((it, i) => (
                          <button
                            key={it.id}
                            type="button"
                            role="option"
                            aria-selected={i === sorotK}
                            tabIndex={-1}
                            data-sorot={
                              row.open && i === sorotK ? "true" : undefined
                            }
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateK(idx, {
                                item: it,
                                query: "",
                                nama: "",
                                open: false,
                              });
                            }}
                            onMouseEnter={() => setSorotK(i)}
                            className={`w-full text-left px-3 py-2 text-[13px] ${klasSorot(
                              i === sorotK
                            )}`}
                          >
                            <div className="flex gap-2">
                              <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                                {it.kode}
                              </span>
                              <span className="truncate">{it.nama}</span>
                            </div>
                            <div className="text-muted text-[11px] mt-0.5">
                              {it.harga == null
                                ? "belum pernah dibeli"
                                : `${rupiah(it.harga)}/${it.satuan}`}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <NumberInput
                value={row.qty}
                onChange={(nilai) => updateK(idx, { qty: nilai })}
                placeholder="Qty/pcs"
                className={inputCls}
              />

              {row.item ? (
                <div
                  className={`${inputCls} text-muted truncate`}
                  title="Harga diambil dari pembelian terakhir item ini"
                >
                  {row.item.harga == null
                    ? "belum ada harga"
                    : rupiah(row.item.harga)}
                </div>
              ) : (
                <NumberInput
                  value={row.harga}
                  onChange={(nilai) => updateK(idx, { harga: nilai })}
                  placeholder="Harga perkiraan"
                  className={inputCls}
                />
              )}

              <button
                type="button"
                onClick={() =>
                  setKRows((rs) =>
                    rs.length > 1
                      ? rs.filter((_, i) => i !== idx)
                      : [barisKemasanKosong()]
                  )
                }
                className="text-muted hover:text-clay-600 p-2"
                aria-label="Hapus baris kemasan"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ============ PERKIRAAN BIAYA ============ */}
      <div className="glass rounded-2xl p-6">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">
          Perkiraan Biaya
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Memakai harga pembelian terakhir tiap bahan. Biaya sebenarnya baru
          lahir saat produksi memotong stok lot per lot.
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Bahan / kg ruahan", nilai: rupiah(biaya.bahanPerKg) },
            {
              label: "Bahan / pcs",
              nilai: biaya.bahanPerPcs == null ? "-" : rupiah(biaya.bahanPerPcs),
            },
            { label: "Kemasan / pcs", nilai: rupiah(biaya.kemasanPerPcs) },
            {
              label: "Total / pcs",
              nilai: biaya.totalPerPcs == null ? "-" : rupiah(biaya.totalPerPcs),
            },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-botanical-100/40 px-3 py-2.5">
              <div className="text-muted text-[11.5px]">{k.label}</div>
              <div className="font-display text-[15px] font-semibold text-ink mt-0.5">
                {k.nilai}
              </div>
            </div>
          ))}
        </div>

        {biaya.bahanPerPcs == null && (
          <p className="text-muted text-[12px] mt-3">
            Isi Gramasi Produk per pcs di atas supaya biaya per pcs bisa dihitung.
          </p>
        )}
        {biaya.tanpaHarga.length > 0 && (
          <p className="text-clay-600 text-[12px] mt-3">
            Belum punya acuan harga: {biaya.tanpaHarga.join(", ")}. Angka di atas
            menghitungnya sebagai nol.
          </p>
        )}
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Formula"}
      </button>
      {konfirmasi.dialog}
    </form>
  );
}
