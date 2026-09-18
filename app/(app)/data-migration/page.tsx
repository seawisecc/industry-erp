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
    optionalCols: [
      "nama_supplier",
      "origin",
      "noc",
      "kategori",
      "keterangan",
      "harga_referensi",
      "moq",
    ],
    note: "Import Supplier dulu, nama_supplier harus sama persis dengan yang terdaftar. Kategori: Bahan Baku / Kemasan. harga_referensi diisi TANPA PPN. Komposisi INCI lewat kartu Komposisi INCI Material.",
    templateSample: [
      "RM-001",
      "Niacinamide PC Grade",
      "PT Chemico Surabaya",
      "China",
      "-",
      "Bahan Baku",
      "-",
      "185000",
      "25",
    ],
    previewCols: ["material_code", "tradename", "nama_supplier"],
  },
  {
    kind: "material_inci",
    title: "Komposisi INCI Material",
    desc: "Impor komposisi INCI tiap material, satu baris per pasangan material dan INCI.",
    requiredCols: ["material_code", "inci_name", "percentage"],
    optionalCols: [],
    note: "Import Material dan INCI Master dulu. Komposisi material yang disebut di file DIGANTI seluruhnya, material yang tidak disebut tidak disentuh. percentage boleh pakai titik atau koma desimal.",
    pesanImport:
      "Komposisi INCI tiap material yang disebut di file diganti seluruhnya dengan isi file. Material yang tidak disebut tidak disentuh.",
    templateSample: ["RM-001", "Niacinamide", "100"],
    previewCols: ["material_code", "inci_name", "percentage"],
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
  {
    kind: "clients",
    title: "Clients",
    desc: "Impor data client untuk konsinyasi, invoice, dan POS.",
    requiredCols: ["company_brand"],
    optionalCols: ["cp", "phone", "npwp", "kategori", "alamat"],
    note: "Kategori: Brand Owner / University/Corporation / Research / Reseller / Walk In Customer / Other (tak dikenal → Other). Kode CL-XXXX dibuat otomatis.",
    templateSample: [
      "PT Cantik Selalu",
      "Rina",
      "081234567890",
      "-",
      "Brand Owner",
      "Jl. Melati No. 2, Denpasar",
    ],
    previewCols: ["company_brand", "cp", "kategori"],
  },
  {
    kind: "products",
    title: "Products",
    desc: "Impor data produk jadi. Formula & varian lewat dua kartu sesudahnya.",
    requiredCols: ["nama_produk"],
    optionalCols: ["kode", "brand", "kategori", "batch_size_kg"],
    note: "kode dikosongkan = PRD-XXXX otomatis. Kode inilah yang dirujuk CSV Formula & Varian Produk. Kode yang sudah terdaftar ditolak: import ini cuma menambah produk baru.",
    templateSample: ["Brightening Serum", "", "GlowLab", "Skincare", "100"],
    previewCols: ["nama_produk", "kode", "brand"],
  },
  {
    kind: "product_formula",
    title: "Formula Produk",
    desc: "Impor formula % tiap produk, satu baris per bahan.",
    requiredCols: ["kode_produk", "kode_item", "percentage"],
    optionalCols: ["fase", "nama_produk", "nama_item"],
    note: "Import Products dan Item Stok Bahan dulu. Bahannya dirujuk lewat kode item stok (bukan kode material), dan cuma Bahan Baku. Formula produk yang disebut di file DIGANTI seluruhnya, produk yang tidak disebut tidak disentuh. nama_produk & nama_item cuma keterangan, yang dicocokkan kodenya.",
    pesanImport:
      "Formula tiap produk yang disebut di file diganti seluruhnya dengan isi file. Produk yang tidak disebut tidak disentuh.",
    templateSample: ["PRD-0001", "ITM-0001", "5", "A", "Brightening Serum", "Niacinamide"],
    previewCols: ["kode_produk", "kode_item", "percentage"],
  },
  {
    kind: "product_variants",
    title: "Varian Produk",
    desc: "Impor ukuran & harga jual tiap produk, satu baris per varian.",
    requiredCols: ["kode_produk", "netto", "satuan_netto"],
    optionalCols: ["harga_jual", "nama_produk"],
    note: "satuan_netto: g / ml. Nama varian dibentuk dari netto + satuan (mis. 30 ml), sama dengan form Produk. Varian yang sudah ada diperbarui, yang belum ada ditambahkan, TIDAK ada yang dihapus. harga_jual kosong = harga lama tidak diubah. Kemasan per varian tetap lewat form Edit Produk.",
    pesanImport:
      "Varian yang sudah ada diperbarui netto & harganya, varian baru ditambahkan. Tidak ada varian yang dihapus.",
    templateSample: ["PRD-0001", "30", "ml", "125000", "Brightening Serum"],
    previewCols: ["kode_produk", "netto", "harga_jual"],
  },
  {
    kind: "services",
    title: "Services",
    desc: "Impor daftar jasa (maklon, uji, notifikasi) yang bisa ditagihkan di Invoice.",
    requiredCols: ["nama_jasa"],
    optionalCols: ["keterangan", "biaya", "aktif"],
    note: "Kode SRV-XXXX dibuat otomatis. Biaya diisi angka tanpa titik pemisah ribuan. Kolom aktif: Aktif / Nonaktif, dikosongkan berarti Aktif. Nama jasa yang sudah terdaftar ditolak, jangan dobel.",
    templateSample: [
      "Jasa Formulasi",
      "Pengembangan formula sampai stabil, 3 kali revisi",
      "5000000",
      "Aktif",
    ],
    previewCols: ["nama_jasa", "biaya", "aktif"],
  },
];

export default function DataMigrationPage() {
  return (
    <SettingsShell>
      <h2 className="font-display text-lg font-semibold text-ink">Data Migration</h2>
      <p className="text-muted text-[12.5px] mt-0.5">
        Satu pintu untuk onboarding &amp; update data massal: download template,
        isi, upload. Tiap kartu juga bisa <b>Export CSV</b> dengan kolom yang sama
        seperti template, jadi hasilnya bisa disunting di Excel lalu diupload
        balik.
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
        {CARDS.map((c) => (
          <ImportCard key={c.kind} config={c} />
        ))}

        <ExportCard />

        {/* ===== Kartu Stock Adjustment ===== */}
        <div className="glass rounded-2xl p-5 flex flex-col gap-3 h-full">
          <div className="bg-amber-100 text-amber-500 rounded-xl p-2.5 self-start">
            <SlidersHorizontal size={18} />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">
              Stock Adjustment
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Input stok awal &amp; stock opname, seluruh item tampil dalam satu
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
          <b>Komposisi INCI Material</b> → 5) <b>Item Stok Bahan</b> → 6){" "}
          <b>Stock Adjustment</b> (isi stok awal + harga). Untuk produk jadi:{" "}
          <b>Products</b> → <b>Formula Produk</b> (sesudah Item Stok Bahan) →{" "}
          <b>Varian Produk</b>. Simpan file sebagai <b>CSV UTF-8</b>; header harus sama persis
          dengan template. Delimiter koma maupun titik-koma (Excel Indonesia)
          sama-sama dikenali.
        </p>
      </div>
    </SettingsShell>
  );
}
