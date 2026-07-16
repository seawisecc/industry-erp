import Link from "next/link";
import { SlidersHorizontal, ArrowRight } from "lucide-react";
import ImportCard, { ImportCardConfig } from "./ImportCard";
import ExportCard from "./ExportCard";
import SettingsShell from "@/components/SettingsShell";

const CARDS: ImportCardConfig[] = [
  {
    kind: "suppliers",
    title: "Daftar Supplier",
    desc: "Impor daftar supplier bahan baku & kemasan.",
    requiredCols: ["nama"],
    optionalCols: ["alamat", "nama_kontak", "no_telp", "email", "npwp"],
    note: "Kolom telp/npwp di Excel diformat Text dulu supaya tidak berubah jadi notasi ilmiah.",
    templateSample: [
      "PT Chemico Surabaya",
      "Jl. Industri No. 1 Surabaya",
      "Budi",
      "081234567890",
      "sales@chemico.co.id",
      "01.234.567.8-901.000",
    ],
    previewCols: ["nama", "nama_kontak", "no_telp"],
  },
  {
    kind: "inci",
    title: "INCI Master",
    desc: "Impor daftar INCI name untuk regulasi & komposisi material.",
    requiredCols: ["inci_name"],
    optionalCols: ["cas_number", "noael", "function", "reference"],
    note: "Nama yang sudah ada di database otomatis dilewati (tidak dobel).",
    templateSample: ["Niacinamide", "98-92-0", "-", "Skin conditioning", "CIR 2005"],
    previewCols: ["inci_name", "cas_number", "function"],
  },
  {
    kind: "materials",
    title: "Material",
    desc: "Impor material (raw material & kemasan) beserta supplier-nya.",
    requiredCols: ["material_code", "tradename"],
    optionalCols: ["nama_supplier", "origin", "noc", "kategori", "keterangan"],
    note: "Import Supplier dulu — nama_supplier harus sama persis dengan yang terdaftar. Kategori: Bahan Baku / Kemasan. Komposisi INCI diisi lewat form Material.",
    templateSample: [
      "RM-001",
      "Niacinamide PC Grade",
      "PT Chemico Surabaya",
      "China",
      "-",
      "Bahan Baku",
      "-",
    ],
    previewCols: ["material_code", "tradename", "nama_supplier"],
  },
  {
    kind: "items",
    title: "Item Stok Bahan",
    desc: "Impor item gudang yang stoknya mau dilacak.",
    requiredCols: ["nama", "satuan"],
    optionalCols: ["kategori", "stok_minimum"],
    note: "Kategori: Bahan Baku / Kemasan. Link ke Material & stok awal diisi setelahnya (stok awal lewat kartu Adjustment di bawah).",
    templateSample: ["Niacinamide", "kg", "Bahan Baku", "5"],
    previewCols: ["nama", "satuan", "kategori"],
  },
];

export default function DataMigrationPage() {
  return (
    <SettingsShell>
      <h2 className="font-display text-lg font-semibold text-ink">Data Migration</h2>
      <p className="text-muted text-[12.5px] mt-0.5">
        Satu pintu untuk onboarding &amp; update data massal — download template,
        isi, upload.
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        {CARDS.map((c) => (
          <ImportCard key={c.kind} config={c} />
        ))}

        <ExportCard />

        {/* ===== Kartu Adjustment Stok ===== */}
        <div className="glass rounded-2xl p-5 flex flex-col gap-3">
          <div className="bg-amber-100 text-amber-500 rounded-xl p-2.5 self-start">
            <SlidersHorizontal size={18} />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">
              Adjustment Stok
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Input stok awal &amp; stock opname — seluruh item tampil dalam satu
              form, tinggal sesuaikan qty &amp; harga.
            </p>
          </div>
          <p className="text-[11.5px] text-muted">
            Stok bertambah tercatat sebagai batch &ldquo;Stock Adjustment&rdquo;;
            stok berkurang dipotong FEFO. Semua tercatat di riwayat.
          </p>
          <div className="mt-auto flex flex-col gap-2">
            <Link
              href="/data-migration/adjustment/new"
              className="flex items-center justify-center gap-2 bg-botanical-700 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-botanical-800 transition-colors"
            >
              Buka Form Adjustment <ArrowRight size={15} />
            </Link>
            <Link
              href="/data-migration/adjustment"
              className="flex items-center justify-center gap-2 border border-line rounded-lg py-2 text-[13px] font-medium hover:bg-white/60 transition-colors"
            >
              Riwayat Adjustment
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-5 glass rounded-2xl p-5">
        <div className="text-[13px] font-semibold text-ink mb-1">
          Urutan yang disarankan
        </div>
        <p className="text-[12.5px] text-muted leading-relaxed">
          1) <b>Supplier</b> → 2) <b>INCI Master</b> → 3) <b>Material</b> → 4){" "}
          <b>Item Stok Bahan</b> → 5) <b>Adjustment Stok</b> (isi stok awal +
          harga). Simpan file sebagai <b>CSV UTF-8</b>; header harus sama persis
          dengan template. Delimiter koma maupun titik-koma (Excel Indonesia)
          sama-sama dikenali.
        </p>
      </div>
    </SettingsShell>
  );
}
