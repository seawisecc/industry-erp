"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, RotateCcw, Tags } from "lucide-react";
import {
  saveExecution,
  ExecutionData,
  StepLog,
  IpcHasil,
} from "../../../actions";
import DataTable from "@/components/DataTable";
import RowActions, { ActionTip, iconActionClass } from "@/components/RowActions";
import StokKurangAlert from "@/components/StokKurangAlert";
import { gabungKebutuhan, hitungKekurangan } from "@/lib/stokCek";
import { urutkanFormula, faseKey, faseLabel } from "@/lib/formulaOrder";
import { useConfirmSave } from "@/components/ConfirmSave";
import { enterKeFieldBerikutnya, klasSorot, tombolCombo } from "@/lib/keyboard";
import NumberInput from "@/components/NumberInput";
import { localTimeStr } from "@/lib/dates";

/* ------------------------------------------------------------
   Draft otomatis di browser.

   Form ini dipakai berjam-jam di lantai produksi: timestamp MES,
   hasil timbang, IPC, rekonsiliasi kemasan. Sebelum ada draft,
   semuanya cuma ada di memori: tab ke-refresh, HP terkunci lalu
   browser dimatikan, atau kena auto-logout = hilang semua.
   Draft disimpan tiap ada perubahan, dan ditawarkan untuk
   dipulihkan (bukan langsung ditimpa) saat form dibuka lagi.
   ------------------------------------------------------------ */

type Draft = {
  savedAt: string;
  bahanReal: Record<string, string>;
  variantPcs: Record<string, string>;
  kemasanQty: Record<string, string>;
  kemasanTerpakai: Record<string, string>;
  kemasanRusak: Record<string, string>;
  bulkReal: string;
  adjust: { item_id: string; qty: string }[];
  ipcRows: IpcHasil[];
  stepLogs: StepLog[];
};

function draftKey(planId: string) {
  return `exec-draft-${planId}`;
}

function readDraft(planId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(planId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------
   Draft yang DITAWARKAN saat form dibuka.

   localStorage tidak ada di server, jadi tidak bisa dibaca sebagai
   initial state biasa, hidrasinya akan bentrok (server tanpa banner,
   klien dengan banner). useSyncExternalStore menyelesaikan itu:
   getServerSnapshot dipakai saat render server & hidrasi, lalu React
   berpindah ke getSnapshot tanpa dianggap bentrok.

   Syaratnya getSnapshot harus mengembalikan nilai yang SAMA PERSIS
   selama tidak ada perubahan. readDraft mem-parse JSON, jadi tiap
   panggilan menghasilkan objek baru dan React akan me-render tanpa
   henti, makanya hasilnya di-cache per plan.

   Cache sengaja TIDAK dibatalkan oleh autosave: yang ditawarkan memang
   harus tetap versi saat form dibuka, bukan ketikan yang barusan
   tersimpan. Pembatalannya di unmount, supaya kunjungan berikutnya
   membaca ulang dari localStorage.
   ------------------------------------------------------------ */
const draftAwalCache = new Map<string, Draft | null>();

function draftAwal(planId: string): Draft | null {
  if (!draftAwalCache.has(planId)) draftAwalCache.set(planId, readDraft(planId));
  return draftAwalCache.get(planId) ?? null;
}

function lupakanDraftAwal(planId: string) {
  draftAwalCache.delete(planId);
}

/** Nilainya cuma dibaca sekali saat form dibuka, tidak perlu langganan. */
function tanpaLangganan() {
  return () => {};
}

export type ItemInfo = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  /** Item nonaktif tetap dikirim supaya bahan lama di formula tetap
      ketahuan stoknya, tapi tidak ditawarkan lagi di Adjusting. */
  aktif: boolean;
};

export type PlanInfo = {
  id: string;
  no_batch: string;
  jumlah_batch: number;
  bulkKg: number;
  formulas: { item_id: string; percentage: number; fase: string | null }[];
  variants: {
    nama_varian: string;
    netto: number | null;
    packaging: { item_id: string; qty_per_pcs: number }[];
  }[];
  saved: ExecutionData | null;
  steps: {
    urutan: number;
    instruksi: string;
    suhu: string | null;
    rpm: string | null;
    durasi: string | null;
  }[];
  mesOn: boolean;
  qcOn: boolean;
  operator: string;
  produkKode: string | null;
  produkNama: string;
  brand: string | null;
  batchSizeKg: number;
  tanggalRencana: string;
  ipcParams: IpcHasil[];
};

type AdjustRow = { item: ItemInfo | null; query: string; open: boolean; qty: string };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function toStr(n: number) {
  return String(Math.round(n * 10000) / 10000);
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

export default function ExecuteForm({
  plan,
  items,
  ppicHref,
}: {
  plan: PlanInfo;
  items: ItemInfo[];
  /** null bila user tidak punya akses modul PPIC */
  ppicHref: string | null;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const itemOf = (id: string) => items.find((it) => it.id === id);
  /**
   * Formula diurut per fase, lalu bahan terbesar dulu, urutan kerja di
   * lantai. Persis sama dengan urutan di detail produk dan Batch Record,
   * supaya operator tidak perlu mencocokkan baris satu per satu.
   *
   * Ini urutan TAMPILAN saja. Yang dikirim ke server tetap
   * `plan.formulas` apa adanya (lihat handleSubmit), supaya
   * execution_data batch yang sedang berjalan tidak berubah bentuk.
   */
  const formulaTersortir = urutkanFormula(plan.formulas);
  /** Jumlah bahan seharusnya untuk ukuran batch ini. */
  const teoritisOf = (f: (typeof plan.formulas)[number]) =>
    (f.percentage / 100) * plan.bulkKg;

  /**
   * Cetak label penimbangan untuk satu bahan yang baru selesai ditimbang.
   *
   * Dibuka di TAB BARU, dan itu bukan pilihan gaya: isi form ini
   * (timbangan, jam MES, IPC) baru jadi dokumen saat tombol Simpan
   * ditekan. Navigasi biasa akan meninggalkan halaman di tengah
   * penimbangan, draft memang menyelamatkannya, tapi operator yang
   * sedang berdiri di depan timbangan tidak boleh dipaksa mengandalkan
   * itu hanya untuk mencetak selembar label.
   *
   * URL-nya dirakit saat DIKLIK, bukan saat render, karena memuat jam
   * penimbangan: nilai yang berbeda antara render server dan klien
   * akan dianggap bentrok hidrasi oleh React.
   */
  function cetakLabelTimbang(arg: {
    bahan: string;
    kode: string;
    qty: string;
    satuan: string;
    fase: string;
  }) {
    const q = new URLSearchParams({
      bahan: arg.bahan,
      kode: arg.kode,
      qty: arg.qty,
      satuan: arg.satuan,
      fase: arg.fase,
      oleh: plan.operator,
      produk: [plan.produkNama, plan.brand].filter(Boolean).join(" · "),
      batch: plan.no_batch,
      guna: `Produksi ruahan ${formatId(plan.bulkKg)} kg (${formatId(
        plan.jumlah_batch
      )} batch)`,
      t: new Date().toISOString(),
    });
    window.open(`/print/label/penimbangan?${q}`, "_blank", "noopener");
  }

  // ===== Bahan (formula): teoritis fixed, real editable =====
  const [bahanReal, setBahanReal] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of plan.formulas) {
      const teoritis = (f.percentage / 100) * plan.bulkKg;
      const saved = plan.saved?.bahan?.find((b) => b.item_id === f.item_id);
      init[f.item_id] = saved ? toStr(saved.real) : toStr(teoritis);
    }
    return init;
  });

  // ===== Varian: rencana pcs =====
  const [variantPcs, setVariantPcs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of plan.variants) {
      const saved = plan.saved?.variants?.find((s) => s.nama_varian === v.nama_varian);
      init[v.nama_varian] = saved ? String(saved.rencana_pcs) : "";
    }
    return init;
  });

  // ===== Kemasan: real diambil (editable) =====
  const [kemasanQty, setKemasanQty] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of plan.saved?.kemasan || []) init[k.item_id] = toStr(k.qty);
    return init;
  });

  // ===== Adjusting =====
  const [adjustRows, setAdjustRows] = useState<AdjustRow[]>(() =>
    (plan.saved?.adjust || []).map((a) => ({
      item: itemOf(a.item_id) || null,
      query: "",
      open: false,
      qty: toStr(a.qty),
    }))
  );
  const [sorot, setSorot] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ===== Hasil ruahan & rekonsiliasi kemasan (Catatan Pengemasan) =====
  const [bulkReal, setBulkReal] = useState(
    plan.saved?.bulk_real != null ? toStr(plan.saved.bulk_real) : ""
  );
  const [kemasanTerpakai, setKemasanTerpakai] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const k of plan.saved?.kemasan || [])
        if (k.terpakai != null) init[k.item_id] = toStr(k.terpakai);
      return init;
    }
  );
  const [kemasanRusak, setKemasanRusak] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of plan.saved?.kemasan || [])
      if (k.rusak != null) init[k.item_id] = toStr(k.rusak);
    return init;
  });

  // ===== IPC: hasil uji produk ruahan =====
  const [ipcRows, setIpcRows] = useState<IpcHasil[]>(() =>
    plan.ipcParams.map((p) => {
      const saved = plan.saved?.ipc?.find((x) => x.nama === p.nama);
      return { ...p, hasil: saved?.hasil || "" };
    })
  );

  // ===== MES: log langkah produksi =====
  const [stepLogs, setStepLogs] = useState<StepLog[]>(() =>
    plan.steps.map((s) => {
      const saved = plan.saved?.langkah?.find((l) => l.urutan === s.urutan);
      return (
        saved || {
          urutan: s.urutan,
          instruksi: s.instruksi,
          mulai: null,
          selesai: null,
          oleh: null,
          catatan: null,
        }
      );
    })
  );

  function updateStepLog(urutan: number, patch: Partial<StepLog>) {
    setStepLogs((ls) =>
      ls.map((l) => (l.urutan === urutan ? { ...l, ...patch } : l))
    );
  }

  // ===== Draft otomatis =====
  /** Sidik jari isi form saat pertama dirender, pembanding "sudah berubah?" */
  const isiAwal = useRef<string | null>(null);
  const dirty = useRef(false);
  const submitted = useRef(false);

  // Draft yang tertinggal dari sesi sebelumnya (lihat catatan di draftAwal)
  const draftTersimpan = useSyncExternalStore(
    tanpaLangganan,
    () => draftAwal(plan.id),
    () => null // server & hidrasi: belum ada draft yang bisa dibaca
  );
  const [draftDitutup, setDraftDitutup] = useState(false);
  const draftFound = draftDitutup ? null : draftTersimpan;

  // Baca ulang dari localStorage kalau form ini dibuka lagi nanti
  useEffect(() => () => lupakanDraftAwal(plan.id), [plan.id]);

  // Simpan tiap ada perubahan
  useEffect(() => {
    if (submitted.current) return;

    const isi = {
      bahanReal,
      variantPcs,
      kemasanQty,
      kemasanTerpakai,
      kemasanRusak,
      bulkReal,
      adjust: adjustRows
        .filter((r) => r.item)
        .map((r) => ({ item_id: r.item!.id, qty: r.qty })),
      ipcRows,
      stepLogs,
    };
    // Tanpa savedAt: yang dibandingkan isinya, bukan jamnya
    const sidikJari = JSON.stringify(isi);

    // Render pertama = nilai awal form, bukan perubahan user.
    //
    // Perbandingan isi, BUKAN flag "sudah pernah jalan". Flag ref tidak
    // aman: React StrictMode (dev) menjalankan effect → cleanup → effect
    // lagi, dan pada putaran kedua flag-nya sudah terpakai sehingga form
    // yang masih kosong ikut ditulis, menimpa draft asli user dengan
    // nilai awal. Itu justru menghapus data yang mau diselamatkan.
    if (isiAwal.current === null) {
      isiAwal.current = sidikJari;
      return;
    }
    if (sidikJari === isiAwal.current) return; // belum ada perubahan nyata

    dirty.current = true;
    const draft: Draft = { savedAt: new Date().toISOString(), ...isi };
    try {
      localStorage.setItem(draftKey(plan.id), JSON.stringify(draft));
    } catch {
      // storage penuh / mode privat, biarkan, form tetap jalan
    }
  }, [
    plan.id,
    bahanReal,
    variantPcs,
    kemasanQty,
    kemasanTerpakai,
    kemasanRusak,
    bulkReal,
    adjustRows,
    ipcRows,
    stepLogs,
  ]);

  // Cegah tab ditutup dengan data yang belum tersimpan ke server
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (!dirty.current || submitted.current) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function applyDraft(d: Draft) {
    setBahanReal(d.bahanReal ?? {});
    setVariantPcs(d.variantPcs ?? {});
    setKemasanQty(d.kemasanQty ?? {});
    setKemasanTerpakai(d.kemasanTerpakai ?? {});
    setKemasanRusak(d.kemasanRusak ?? {});
    setBulkReal(d.bulkReal ?? "");
    setAdjustRows(
      (d.adjust ?? []).map((a) => ({
        item: itemOf(a.item_id) || null,
        query: "",
        open: false,
        qty: a.qty,
      }))
    );
    if (d.ipcRows?.length) setIpcRows(d.ipcRows);
    if (d.stepLogs?.length) setStepLogs(d.stepLogs);
    setDraftDitutup(true);
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey(plan.id));
    } catch {
      // abaikan
    }
    lupakanDraftAwal(plan.id);
    setDraftDitutup(true);
  }

  // Kebutuhan kemasan teoritis dari rencana pcs varian
  const kemasanTeoritis = new Map<string, number>();
  for (const v of plan.variants) {
    const pcs = parseNum(variantPcs[v.nama_varian] || "");
    if (pcs <= 0) continue;
    for (const p of v.packaging) {
      kemasanTeoritis.set(
        p.item_id,
        (kemasanTeoritis.get(p.item_id) || 0) + p.qty_per_pcs * pcs
      );
    }
  }
  const kemasanIds = Array.from(
    new Set([...kemasanTeoritis.keys(), ...Object.keys(kemasanQty)])
  );

  /** Kemasan yang benar-benar diambil ke lantai produksi. */
  const diambilOf = (id: string) => {
    const teoritis = kemasanTeoritis.get(id) || 0;
    return kemasanQty[id] !== undefined ? parseNum(kemasanQty[id]) : teoritis;
  };
  /** Diambil - terpakai - rusak; harus nol atau lebih supaya rekonsiliasi seimbang. */
  const sisaKemasanOf = (id: string) =>
    diambilOf(id) -
    parseNum(kemasanTerpakai[id] || "") -
    parseNum(kemasanRusak[id] || "");

  /* ===== Peringatan stok, seluruh bahan yang akan terpotong =====
     Bahan formula, kemasan, dan adjusting dijumlahkan jadi satu daftar
     karena create_production memotong ketiganya sekaligus di akhir
     alur. Nilainya ikut berubah tiap angka diketik, jadi operator yang
     menaikkan timbangan melewati stok langsung melihatnya, bukan nanti
     saat Input Hasil ditolak.

     Dihitung di badan komponen, bukan useEffect + setState: ini murni
     turunan dari isian form. */
  const kekurangan = hitungKekurangan(
    gabungKebutuhan([
      ...plan.formulas.map((f) => ({
        item_id: f.item_id,
        qty: parseNum(bahanReal[f.item_id] || ""),
      })),
      ...kemasanIds.map((id) => ({ item_id: id, qty: diambilOf(id) })),
      ...adjustRows
        .filter((r) => r.item)
        .map((r) => ({ item_id: r.item!.id, qty: parseNum(r.qty) })),
    ]),
    itemOf
  );

  function updateAdjust(idx: number, patch: Partial<AdjustRow>) {
    setAdjustRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function adjustOptions(row: AdjustRow) {
    if (!row.open || !row.query) return [];
    const q = row.query.toLowerCase();
    const used = adjustRows.map((r) => r.item?.id).filter(Boolean);
    return items
      .filter((it) => it.aktif)
      .filter((it) => !used.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) => it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: "Simpan penimbangan batch ini?",
      pesan: "Angka timbangan ini yang dipakai saat hasil produksi dikunci nanti.",
      ringkasan: [
        { label: "No. Batch", nilai: plan.no_batch },
        { label: "Produk", nilai: plan.produkNama },
        {
          label: "Bahan Ditimbang",
          nilai:
            plan.formulas.filter((f) => parseNum(bahanReal[f.item_id] || "") > 0)
              .length +
            " dari " +
            plan.formulas.length,
        },
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");

    const data: ExecutionData = {
      bahan: plan.formulas.map((f) => ({
        item_id: f.item_id,
        teoritis: (f.percentage / 100) * plan.bulkKg,
        real: parseNum(bahanReal[f.item_id] || ""),
      })),
      variants: plan.variants.map((v) => ({
        nama_varian: v.nama_varian,
        rencana_pcs: parseNum(variantPcs[v.nama_varian] || ""),
      })),
      kemasan: kemasanIds
        .map((id) => ({
          item_id: id,
          qty:
            kemasanQty[id] !== undefined
              ? parseNum(kemasanQty[id])
              : kemasanTeoritis.get(id) || 0,
          terpakai: parseNum(kemasanTerpakai[id] || ""),
          rusak: parseNum(kemasanRusak[id] || ""),
        }))
        .filter((k) => k.qty > 0),
      ipc: plan.qcOn && ipcRows.length > 0 ? ipcRows : plan.saved?.ipc,
      bulk_real: bulkReal ? parseNum(bulkReal) : undefined,
      adjust: adjustRows
        .filter((r) => r.item && parseNum(r.qty) > 0)
        .map((r) => ({ item_id: r.item!.id, qty: parseNum(r.qty) })),
      langkah: plan.mesOn && stepLogs.length > 0 ? stepLogs : plan.saved?.langkah,
    };

    try {

      const result = await saveExecution(plan.id, data);
      if (result.ok) {
        // Sudah aman di server, draft lokal tidak diperlukan lagi
        submitted.current = true;
        try {
          localStorage.removeItem(draftKey(plan.id));
        } catch {
          // abaikan
        }
        router.push("/production");
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
      {/* ===== Tawaran pulihkan draft dari sesi sebelumnya ===== */}
      {draftFound && (
        <div className="glass rounded-2xl p-4 sm:p-5 border-amber-500/40 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-display text-[14.5px] font-semibold text-ink flex items-center gap-2">
              <RotateCcw size={15} className="text-amber-500 flex-shrink-0" />
              Ada isian yang belum tersimpan
            </div>
            <p className="text-muted text-[12.5px] mt-0.5 leading-snug">
              Tersimpan otomatis di perangkat ini{" "}
              {new Date(draftFound.savedAt).toLocaleString("id-ID", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Pulihkan supaya tidak perlu mengisi ulang.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => applyDraft(draftFound)}
              className="h-9 px-3.5 rounded-lg bg-botanical-700 text-white text-[12.5px] font-medium hover:bg-botanical-800 transition-colors"
            >
              Pulihkan
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="h-9 px-3.5 rounded-lg border border-line text-muted text-[12.5px] font-medium hover:text-ink transition-colors"
            >
              Buang
            </button>
          </div>
        </div>
      )}

      {/* ===== Peringatan stok, sebelum satu bahan pun ditimbang ===== */}
      <StokKurangAlert
        kekurangan={kekurangan}
        keterangan={`batch ini (${formatId(plan.bulkKg)} kg ruahan)`}
        ppicHref={ppicHref}
      />

      {/* ============ TAHAP 1, CATATAN PENGOLAHAN BATCH ============ */}
      <div className="flex items-center gap-3">
        <div className="bg-botanical-700 text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold">
          TAHAP 1
        </div>
        <h2 className="font-display text-[17px] font-semibold text-ink">
          Catatan Pengolahan Batch
        </h2>
      </div>

      {/* ===== INFORMASI PRODUK ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-3">
          Informasi Produk
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Produk
            </div>
            <div className="font-medium">{plan.produkNama}</div>
            <div className="text-[11.5px] text-muted font-mono">
              {[plan.produkKode, plan.brand].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              No. Batch
            </div>
            <div className="font-mono font-medium">{plan.no_batch}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Ukuran Batch
            </div>
            <div className="font-medium">
              {formatId(plan.jumlah_batch)} × {formatId(plan.batchSizeKg)} kg ={" "}
              {formatId(plan.bulkKg)} kg
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Tanggal Produksi
            </div>
            <div className="font-medium">
              {new Date(plan.tanggalRencana + "T00:00:00").toLocaleDateString(
                "id-ID",
                { day: "numeric", month: "long", year: "numeric" }
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== FORMULASI & FASE ===== */}
      <div className="glass rounded-2xl overflow-hidden">
        <h3 className="font-display text-[15px] font-semibold text-ink px-6 pt-5 pb-3">
          Formulasi &amp; Fase
        </h3>
        <DataTable
          rows={formulaTersortir}
          rowKey={(f) => f.item_id}
          minWidth={560}
          chrome="bare"
          expandable={false}
          empty="Belum ada formulasi."
          columns={[
            {
              key: "fase",
              header: "Fase",
              role: "badge",
              align: "center",
              className: "font-semibold text-botanical-700 whitespace-nowrap",
              cell: (f) => f.fase || "-",
              cardCell: (f) => (
                <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-botanical-100 text-botanical-700 whitespace-nowrap">
                  Fase {f.fase || "-"}
                </span>
              ),
            },
            {
              key: "kode",
              header: "Kode",
              role: "subtitle",
              className: "font-mono text-[11.5px] whitespace-nowrap",
              cell: (f) => itemOf(f.item_id)?.kode,
            },
            {
              key: "bahan",
              header: "Bahan",
              role: "title",
              cell: (f) => itemOf(f.item_id)?.nama || "-",
            },
            {
              key: "pct",
              header: "%",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (f) => `${f.percentage.toLocaleString("id-ID")}%`,
            },
            {
              key: "qty",
              header: "Qty Batch",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-mono text-[12px]",
              cell: (f) =>
                `${formatId(teoritisOf(f))} ${itemOf(f.item_id)?.satuan ?? ""}`,
            },
          ]}
        />
      </div>

      {/* ===== BAHAN BAKU: teoritis vs real ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Penimbangan Bahan
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Kolom kiri = jumlah teoritis, kolom kanan = hasil timbang nyata di
            lapangan (boleh koma).
          </p>
        </div>

        <DataTable
          rows={formulaTersortir}
          rowKey={(f) => f.item_id}
          minWidth={620}
          chrome="bare"
          expandable={false}
          empty="Belum ada bahan pada formula."
          groupBy={{
            key: (f) => faseKey(f.fase),
            header: (g) => (
              <>
                {faseLabel(g.key)}
                <span className="font-normal text-muted normal-case tracking-normal">
                  {" "}
                  · {g.rows.length} bahan ·{" "}
                  {formatId(
                    g.rows.reduce((s, f) => s + teoritisOf(f), 0)
                  )} kg
                </span>
              </>
            ),
          }}
          columns={[
            {
              key: "bahan",
              header: "Bahan",
              role: "title",
              cell: (f) => {
                const it = itemOf(f.item_id);
                return (
                  <>
                    <div className="font-medium">{it?.nama || "-"}</div>
                    <div className="text-[11px] text-muted font-mono">
                      {it?.kode} · stok {formatId(it?.stok || 0)} {it?.satuan}
                    </div>
                  </>
                );
              },
              cardCell: (f) => {
                const it = itemOf(f.item_id);
                return (
                  <>
                    <div>{it?.nama || "-"}</div>
                    <div className="text-[11px] text-muted font-mono font-normal">
                      {it?.kode} · stok {formatId(it?.stok || 0)} {it?.satuan}
                    </div>
                  </>
                );
              },
            },
            {
              key: "pct",
              header: "% Formula",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (f) => `${f.percentage.toLocaleString("id-ID")}%`,
            },
            {
              key: "teoritis",
              header: "Teoritis",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-mono text-[12px]",
              cell: (f) =>
                `${formatId(teoritisOf(f))} ${itemOf(f.item_id)?.satuan ?? ""}`,
            },
            {
              key: "real",
              header: "Timbang Real",
              role: "primary",
              headClassName: "w-[140px]",
              cell: (f) => {
                const it = itemOf(f.item_id);
                const real = parseNum(bahanReal[f.item_id] || "");
                return (
                  <NumberInput
                    aria-label={`Timbang real ${it?.nama ?? ""}`}
                    value={bahanReal[f.item_id] || ""}
                    onChange={(nilai) =>
                      setBahanReal((s) => ({ ...s, [f.item_id]: nilai }))
                    }
                    className={`${inputCls} ${
                      it && real > it.stok ? "ring-2 ring-clay-500" : ""
                    }`}
                  />
                );
              },
            },
            {
              key: "selisih",
              header: "Selisih",
              role: "primary",
              align: "right",
              cell: (f) => {
                const diff = parseNum(bahanReal[f.item_id] || "") - teoritisOf(f);
                return (
                  <span
                    className={`whitespace-nowrap font-mono text-[12px] ${
                      Math.abs(diff) < 0.0001
                        ? "text-muted"
                        : diff > 0
                          ? "text-clay-600"
                          : "text-botanical-700"
                    }`}
                  >
                    {Math.abs(diff) < 0.0001
                      ? "-"
                      : `${diff > 0 ? "+" : ""}${formatId(diff)}`}
                  </span>
                );
              },
            },
            {
              key: "label",
              header: "Label",
              role: "actions",
              align: "right",
              className: "whitespace-nowrap",
              cell: (f) => {
                const it = itemOf(f.item_id);
                const qty = bahanReal[f.item_id] || "";
                // Label tanpa angka timbang tidak ada gunanya ditempel,
                // jadi tombolnya mati sampai kolom sebelahnya terisi.
                const belumDitimbang = parseNum(qty) <= 0;
                return (
                  <RowActions>
                    <ActionTip
                      label={
                        belumDitimbang
                          ? "Isi hasil timbang dulu"
                          : "Cetak label penimbangan"
                      }
                    >
                      <button
                        type="button"
                        disabled={belumDitimbang}
                        aria-label={`Cetak label penimbangan ${it?.nama ?? ""}`}
                        onClick={() =>
                          cetakLabelTimbang({
                            bahan: it?.nama || "-",
                            kode: it?.kode || "",
                            qty,
                            satuan: it?.satuan || "",
                            fase: faseLabel(faseKey(f.fase)),
                          })
                        }
                        className={iconActionClass("default", belumDitimbang)}
                      >
                        <Tags size={15} strokeWidth={2} />
                      </button>
                    </ActionTip>
                  </RowActions>
                );
              },
            },
          ]}
        />
      </div>

      {/* ===== ADJUSTING ===== */}
      <div className="relative z-20 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Bahan Tambahan (Adjusting)
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Penambahan di luar formula selama proses (pH adjuster, pewarna, dst).
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setAdjustRows((rs) => [
                ...rs,
                { item: null, query: "", open: false, qty: "" },
              ])
            }
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah Bahan
          </button>
        </div>

        {adjustRows.length === 0 && (
          <p className="text-muted text-[12.5px]">Tidak ada, opsional.</p>
        )}
        {adjustRows.map((row, idx) => {
          const options = adjustOptions(row);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[1fr_140px_32px_32px] gap-2 items-start"
            >
              <div className="relative">
                {row.item ? (
                  <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                    <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                      {row.item.kode}
                    </span>
                    <span className="truncate flex-1">{row.item.nama}</span>
                    <span className="text-[11px] text-muted flex-shrink-0">
                      stok {formatId(row.item.stok)} {row.item.satuan}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateAdjust(idx, { item: null, query: "" })}
                      className="text-muted hover:text-clay-600 flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={row.query}
                      onChange={(e) => {
                        updateAdjust(idx, { query: e.target.value, open: true });
                        setSorot(0);
                      }}
                      onFocus={() => {
                        updateAdjust(idx, { open: true });
                        setSorot(0);
                      }}
                      onBlur={() =>
                        setTimeout(() => updateAdjust(idx, { open: false }), 150)
                      }
                      onKeyDown={(e) =>
                        tombolCombo(e, {
                          jumlah: options.length,
                          sorot,
                          setSorot,
                          buka: !!row.open,
                          setBuka: (b) => updateAdjust(idx, { open: b }),
                          pilih: (i) =>
                            updateAdjust(idx, {
                              item: options[i],
                              query: "",
                              open: false,
                            }),
                        })
                      }
                      placeholder="Ketik kode / nama bahan..."
                      role="combobox"
                      aria-expanded={!!row.open}
                      aria-controls={`daftar-adjust-${idx}`}
                      className={inputCls}
                    />
                    {options.length > 0 && (
                      <div
                        role="listbox"
                        id={`daftar-adjust-${idx}`}
                        className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto"
                      >
                        {options.map((it, i) => (
                          <button
                            key={it.id}
                            type="button"
                            role="option"
                            aria-selected={i === sorot}
                            tabIndex={-1}
                            data-sorot={row.open && i === sorot ? "true" : undefined}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateAdjust(idx, { item: it, query: "", open: false });
                            }}
                            onMouseEnter={() => setSorot(i)}
                            className={`w-full text-left px-3 py-2 text-[13px] flex gap-2 ${klasSorot(
                              i === sorot
                            )}`}
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
              <NumberInput
                value={row.qty}
                onChange={(nilai) => updateAdjust(idx, { qty: nilai })}
                placeholder={row.item ? `Qty (${row.item.satuan})` : "Qty"}
                className={inputCls}
              />
              {/* Bahan adjusting juga ditimbang, jadi juga butuh label,
                  fasenya "Adjusting" karena memang di luar formula. */}
              <button
                type="button"
                disabled={!row.item || parseNum(row.qty) <= 0}
                aria-label="Cetak label penimbangan bahan adjusting"
                title="Cetak label penimbangan"
                onClick={() =>
                  cetakLabelTimbang({
                    bahan: row.item?.nama || "-",
                    kode: row.item?.kode || "",
                    qty: row.qty,
                    satuan: row.item?.satuan || "",
                    fase: "Adjusting",
                  })
                }
                className="text-muted hover:text-botanical-700 disabled:text-muted/40 disabled:hover:text-muted/40 p-2"
              >
                <Tags size={15} />
              </button>
              <button
                type="button"
                onClick={() => setAdjustRows((rs) => rs.filter((_, i) => i !== idx))}
                className="text-muted hover:text-clay-600 p-2"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ===== MES: CHECKLIST LANGKAH PRODUKSI ===== */}
      {plan.mesOn && plan.steps.length > 0 && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display text-[15.5px] font-semibold text-ink">
                Langkah Produksi
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-botanical-100 text-botanical-700 align-middle">
                  MES
                </span>
              </h2>
              <p className="text-muted text-[12.5px] mt-0.5">
                Tap Mulai saat mengerjakan, Selesai saat rampung, waktu &amp;
                operator terekam otomatis ke Batch Record.
              </p>
            </div>
            <span className="text-[12px] text-muted">
              {stepLogs.filter((l) => l.selesai).length}/{stepLogs.length} selesai
            </span>
          </div>

          {plan.steps.map((s) => {
            const log = stepLogs.find((l) => l.urutan === s.urutan)!;
            // Zona operasional, bukan zona browser: jam yang dilihat
            // operator harus sama persis dengan yang tercetak di batch
            // record, dan halaman cetaknya dirender di server.
            const jam = (iso: string | null) => localTimeStr(iso) || null;
            return (
              <div
                key={s.urutan}
                className={`border rounded-xl p-4 flex flex-col gap-2 transition-colors ${
                  log.selesai
                    ? "border-botanical-700/30 bg-botanical-100/30"
                    : log.mulai
                      ? "border-amber-500/40 bg-amber-100/20"
                      : "border-line"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="font-display text-[15px] font-semibold text-botanical-700 w-6 text-right flex-shrink-0">
                    {s.urutan}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium">{s.instruksi}</div>
                    {(s.suhu || s.rpm || s.durasi) && (
                      <div className="text-[12px] text-muted mt-0.5">
                        {[s.suhu, s.rpm ? `${s.rpm} rpm` : null, s.durasi]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {(log.mulai || log.selesai) && (
                      <div className="text-[11.5px] text-muted mt-1">
                        {log.mulai ? `Mulai ${jam(log.mulai)}` : ""}
                        {log.selesai ? `, Selesai ${jam(log.selesai)}` : ""}
                        {log.oleh ? ` · ${log.oleh}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!log.mulai && (
                      <button
                        type="button"
                        onClick={() =>
                          updateStepLog(s.urutan, {
                            mulai: new Date().toISOString(),
                            oleh: plan.operator || null,
                          })
                        }
                        className="h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                      >
                        Mulai
                      </button>
                    )}
                    {log.mulai && !log.selesai && (
                      <button
                        type="button"
                        onClick={() =>
                          updateStepLog(s.urutan, {
                            selesai: new Date().toISOString(),
                          })
                        }
                        className="h-8 px-3 rounded-lg bg-amber-500 text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                      >
                        Selesai
                      </button>
                    )}
                    {log.selesai && (
                      <span className="text-botanical-700 text-[13px] font-semibold">
                        ✓
                      </span>
                    )}
                  </div>
                </div>
                {log.mulai && (
                  <input
                    value={log.catatan || ""}
                    onChange={(e) =>
                      updateStepLog(s.urutan, {
                        catatan: e.target.value || null,
                      })
                    }
                    placeholder="Catatan / penyimpangan (opsional)"
                    className="w-full glass-input rounded-lg px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* ===== IPC, QC PRODUK RUAHAN ===== */}
      {plan.qcOn && ipcRows.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">
                Hasil Pengujian IPC
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-botanical-100 text-botanical-700 align-middle">
                  QC
                </span>
              </h3>
              <p className="text-muted text-[12px] mt-0.5">
                In-Process Control produk ruahan sebelum dikemas.
              </p>
            </div>
            <span className="text-[12px] text-muted">
              {ipcRows.filter((r) => r.hasil.trim()).length}/{ipcRows.length} terisi
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                  <th className="px-4 py-2 font-semibold sticky-col sticky-col-head">
                    Parameter
                  </th>
                  <th className="px-4 py-2 font-semibold w-[210px]">Spesifikasi</th>
                  <th className="px-4 py-2 font-semibold w-[210px]">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {ipcRows.map((r, i) => (
                  <tr key={r.nama} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 sticky-col">
                      {r.nama}
                      {r.satuan && (
                        <span className="text-muted text-[11.5px]"> ({r.satuan})</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={r.spesifikasi || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIpcRows((rs) =>
                            rs.map((x, j) => (j === i ? { ...x, spesifikasi: v } : x))
                          );
                        }}
                        placeholder="Spesifikasi"
                        className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={r.hasil}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIpcRows((rs) =>
                            rs.map((x, j) => (j === i ? { ...x, hasil: v } : x))
                          );
                        }}
                        placeholder="Hasil uji"
                        className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== HASIL PENGOLAHAN (RUAHAN) ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-1">
          Hasil Pengolahan
        </h3>
        <p className="text-muted text-[12.5px] mb-3">
          Jumlah produk ruahan yang benar-benar dihasilkan dari proses di atas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[11.5px] text-muted mb-1">
              Ruahan Teoritis
            </label>
            <div className="glass-input rounded-lg px-3 py-2.5 text-sm opacity-70">
              {formatId(plan.bulkKg)} kg
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] text-muted mb-1">
              Ruahan Real (kg)
            </label>
            <NumberInput
              value={bulkReal}
              onChange={(nilai) => setBulkReal(nilai)}
              placeholder={formatId(plan.bulkKg)}
              className={inputCls}
            />
          </div>
          <div className="text-[12.5px] pb-2.5">
            {parseNum(bulkReal) > 0 && plan.bulkKg > 0 && (
              <span
                className={
                  parseNum(bulkReal) >= plan.bulkKg * 0.97
                    ? "text-botanical-700 font-medium"
                    : "text-clay-600 font-medium"
                }
              >
                Rendemen{" "}
                {((parseNum(bulkReal) / plan.bulkKg) * 100).toLocaleString("id-ID", {
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ============ TAHAP 2, CATATAN PENGEMASAN BATCH ============ */}
      <div className="flex items-center gap-3 mt-2">
        <div className="bg-botanical-700 text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold">
          TAHAP 2
        </div>
        <h2 className="font-display text-[17px] font-semibold text-ink">
          Catatan Pengemasan Batch
        </h2>
      </div>

      {/* ===== VARIAN & KEMASAN ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Hasil Kemas &amp; Pengambilan Kemasan
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Isi jumlah real yang dihasilkan per ukuran, kebutuhan kemasan
            terhitung otomatis, jumlah ambil bisa disesuaikan.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {plan.variants.map((v) => (
            <div key={v.nama_varian}>
              <label className="block text-[11.5px] text-muted mb-1">
                {v.nama_varian}
              </label>
              <NumberInput
                value={variantPcs[v.nama_varian] || ""}
                onChange={(nilai) =>
                  setVariantPcs((s) => ({ ...s, [v.nama_varian]: nilai }))
                }
                placeholder="0 pcs"
                className={inputCls}
              />
            </div>
          ))}
        </div>

        {kemasanIds.length > 0 && (
          <div className="mt-1">
            <DataTable
              rows={kemasanIds}
              rowKey={(id) => id}
              minWidth={520}
              chrome="bare"
              expandable={false}
              empty="Belum ada kemasan."
              columns={[
                {
                  key: "kemasan",
                  header: "Kemasan",
                  role: "title",
                  cell: (id) => {
                    const it = itemOf(id);
                    return (
                      <>
                        <div className="font-medium">{it?.nama || "-"}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {it?.kode} · stok {formatId(it?.stok || 0)} {it?.satuan}
                        </div>
                      </>
                    );
                  },
                  cardCell: (id) => {
                    const it = itemOf(id);
                    return (
                      <>
                        <div>{it?.nama || "-"}</div>
                        <div className="text-[11px] text-muted font-mono font-normal">
                          {it?.kode} · stok {formatId(it?.stok || 0)} {it?.satuan}
                        </div>
                      </>
                    );
                  },
                },
                {
                  key: "teoritis",
                  header: "Teoritis",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap font-mono text-[12px]",
                  cell: (id) =>
                    `${formatId(kemasanTeoritis.get(id) || 0)} ${itemOf(id)?.satuan ?? ""}`,
                },
                {
                  key: "ambil",
                  header: "Ambil Real",
                  role: "primary",
                  headClassName: "w-[140px]",
                  cell: (id) => {
                    const teoritis = kemasanTeoritis.get(id) || 0;
                    const val =
                      kemasanQty[id] !== undefined
                        ? kemasanQty[id]
                        : teoritis > 0
                          ? toStr(teoritis)
                          : "";
                    return (
                      <NumberInput
                        aria-label={`Ambil real ${itemOf(id)?.nama ?? ""}`}
                        value={val}
                        onChange={(nilai) =>
                          setKemasanQty((s) => ({ ...s, [id]: nilai }))
                        }
                        className={inputCls}
                      />
                    );
                  },
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* ===== REKONSILIASI KEMASAN ===== */}
      {kemasanIds.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-3">
            <h3 className="font-display text-[15px] font-semibold text-ink">
              Rekonsiliasi Kemasan
            </h3>
            <p className="text-muted text-[12px] mt-0.5">
              Diambil vs terpakai, rusak, dan sisa dikembalikan ke gudang -
              selisih harus nol.
            </p>
          </div>
          <div className="px-6 pb-5">
            <DataTable
              rows={kemasanIds}
              rowKey={(id) => id}
              minWidth={720}
              chrome="bare"
              expandable={false}
              empty="Belum ada kemasan."
              columns={[
                {
                  key: "kemasan",
                  header: "Kemasan",
                  role: "title",
                  cell: (id) => {
                    const it = itemOf(id);
                    return (
                      <>
                        <div className="font-medium max-w-[180px] truncate">
                          {it?.nama || "-"}
                        </div>
                        <div className="text-[11px] text-muted font-mono">
                          {it?.kode}
                        </div>
                      </>
                    );
                  },
                  cardCell: (id) => {
                    const it = itemOf(id);
                    return (
                      <>
                        <div>{it?.nama || "-"}</div>
                        <div className="text-[11px] text-muted font-mono font-normal">
                          {it?.kode}
                        </div>
                      </>
                    );
                  },
                },
                {
                  key: "diambil",
                  header: "Diambil",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap font-mono text-[12px]",
                  cell: (id) =>
                    `${formatId(diambilOf(id))} ${itemOf(id)?.satuan ?? ""}`,
                },
                {
                  key: "terpakai",
                  header: "Terpakai",
                  role: "primary",
                  headClassName: "w-[120px]",
                  cell: (id) => (
                    <NumberInput
                      aria-label={`Kemasan terpakai ${itemOf(id)?.nama ?? ""}`}
                      value={kemasanTerpakai[id] || ""}
                      onChange={(nilai) =>
                        setKemasanTerpakai((s) => ({ ...s, [id]: nilai }))
                      }
                      placeholder="0"
                      className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
                    />
                  ),
                },
                {
                  key: "rusak",
                  header: "Rusak",
                  role: "primary",
                  headClassName: "w-[120px]",
                  cell: (id) => (
                    <NumberInput
                      aria-label={`Kemasan rusak ${itemOf(id)?.nama ?? ""}`}
                      value={kemasanRusak[id] || ""}
                      onChange={(nilai) =>
                        setKemasanRusak((s) => ({ ...s, [id]: nilai }))
                      }
                      placeholder="0"
                      className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
                    />
                  ),
                },
                {
                  key: "sisa",
                  header: "Sisa",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap font-mono text-[12px]",
                  cell: (id) => formatId(sisaKemasanOf(id)),
                },
                {
                  key: "status",
                  header: "Status",
                  role: "badge",
                  align: "right",
                  className: "whitespace-nowrap",
                  cell: (id) => {
                    const terpakai = parseNum(kemasanTerpakai[id] || "");
                    const rusak = parseNum(kemasanRusak[id] || "");
                    if (terpakai <= 0 && rusak <= 0)
                      return <span className="text-muted text-[11.5px]">-</span>;
                    const sisa = sisaKemasanOf(id);
                    const seimbang = Math.abs(sisa) < 0.0001 || sisa > 0;
                    return (
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          seimbang
                            ? "bg-botanical-100 text-botanical-700"
                            : "bg-clay-100 text-clay-600"
                        }`}
                      >
                        {seimbang ? "Seimbang" : "Kurang"}
                      </span>
                    );
                  },
                },
              ]}
            />
          </div>
        </div>
      )}

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Data Eksekusi"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Stok belum terpotong di tahap ini, pemotongan terjadi saat Input Hasil
        (Result).
      </p>
      {konfirmasi.dialog}
    </form>
  );
}
