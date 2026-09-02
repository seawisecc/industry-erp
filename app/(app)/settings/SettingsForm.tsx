"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings, SettingsInput } from "./actions";
import { useConfirmSave } from "@/components/ConfirmSave";
import NumberInput from "@/components/NumberInput";
import {
  bytesDataUrl,
  formatBytes,
  siapkanLogo,
  LOGO_MAX_PX,
  type HasilLogo,
} from "@/lib/logo";
import {
  parseTaxSettings,
  penjelasanTaxMode,
  tarifEfektif,
  type TaxMode,
} from "@/lib/invoiceMath";

type Props = {
  initial: SettingsInput | null;
};

export default function SettingsForm({ initial }: Props) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();

  const [form, setForm] = useState<Record<string, string>>({
    alamat: initial?.alamat || "",
    no_telp: initial?.no_telp || "",
    email: initial?.email || "",
    npwp: initial?.npwp || "",
    bank_info: initial?.bank_info || "",
    sign_dibuat_nama: initial?.sign_dibuat_nama || "",
    sign_dibuat_jabatan: initial?.sign_dibuat_jabatan || "",
    sign_disetujui_nama: initial?.sign_disetujui_nama || "",
    sign_disetujui_jabatan: initial?.sign_disetujui_jabatan || "",
    sign_mengetahui_nama: initial?.sign_mengetahui_nama || "",
    sign_mengetahui_jabatan: initial?.sign_mengetahui_jabatan || "",
  });
  const awalPajak = parseTaxSettings(initial);
  const [taxMode, setTaxMode] = useState<TaxMode>(awalPajak.taxMode);
  const [taxPercent, setTaxPercent] = useState(String(awalPajak.taxPercent));
  const [dppNilaiLain, setDppNilaiLain] = useState(awalPajak.dppNilaiLain);

  const [logo, setLogo] = useState<string | null>(initial?.logo || null);
  /** Terisi hanya untuk logo yang BARU dipilih, jadi ukurannya bisa disebut. */
  const [logoBaru, setLogoBaru] = useState<HasilLogo | null>(null);
  const [logoError, setLogoError] = useState("");
  const [logoSibuk, setLogoSibuk] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const logoAwal = initial?.logo || null;
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const tarif = parseFloat(taxPercent.replace(",", ".")) || 0;
  const pajak = { taxMode, taxPercent: tarif, dppNilaiLain };
  const efektif = tarifEfektif(tarif, dppNilaiLain);
  const persenStr = (n: number) =>
    n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

  async function pilihLogo(file: File | undefined) {
    if (!file) return;
    setLogoError("");
    setLogoSibuk(true);
    try {
      const hasil = await siapkanLogo(file);
      setLogo(hasil.dataUrl);
      setLogoBaru(hasil);
      setSaved(false);
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : "Gambarnya tidak bisa diproses."
      );
    } finally {
      setLogoSibuk(false);
      // Supaya memilih berkas yang sama dua kali tetap memicu onChange.
      if (logoInput.current) logoInput.current.value = "";
    }
  }

  function hapusLogo() {
    setLogo(null);
    setLogoBaru(null);
    setLogoError("");
    setSaved(false);
  }

  const logoBytes = logoBaru?.bytes ?? (logo ? bytesDataUrl(logo) : 0);
  const logoBerubah = logo !== logoAwal;

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: "Simpan profil perusahaan?",
      pesan: "Data ini ikut tercetak di PO, faktur, dan dokumen lain.",
      ringkasan: [
        { label: "Alamat", nilai: form.alamat || "-" },
        { label: "No. Telp", nilai: form.no_telp || "-" },
        { label: "Email", nilai: form.email || "-" },
        {
          label: "Logo",
          nilai: !logoBerubah
            ? logo
              ? "tidak diubah"
              : "belum ada"
            : logo
              ? `logo baru, ${formatBytes(logoBytes)}`
              : "dihapus",
        },
        {
          label: "Model PPN",
          nilai: `${
            taxMode === "Include"
              ? "Harga sudah termasuk pajak"
              : "Pajak ditambahkan"
          } · PPN ${persenStr(tarif)}%${
            dppNilaiLain ? ` (DPP Nilai Lain, efektif ${persenStr(efektif)}%)` : ""
          }`,
        },
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const result = await saveSettings({
        ...(form as unknown as SettingsInput),
        logo,
        tax_mode: taxMode,
        tax_percent: tarif,
        tax_dpp_nilai_lain: dppNilaiLain,
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah, muat ulang halaman lalu coba lagi."
      );
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">
          Data Perusahaan
        </h2>
        <p className="text-muted text-[12.5px] -mt-3">
          Muncul di kop dokumen cetak (PO, dsb).
        </p>

        {/* ===== Logo =====
            Gambarnya dikecilkan di browser sebelum dikirim, jadi berkas
            10 MB dari kamera pun berakhir sebagai data URI ~100 KB.
            Yang disimpan cuma satu kolom teks, tidak ada berkas terpisah
            yang bisa hilang atau gagal diambil saat dokumen dicetak. */}
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Logo Perusahaan{" "}
            <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-[104px] h-[104px] shrink-0 rounded-xl border border-line bg-white flex items-center justify-center overflow-hidden">
              {logo ? (
                /* data URI, tidak ada yang bisa dioptimalkan next/image */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt="Logo perusahaan"
                  className="max-w-[88px] max-h-[88px] object-contain"
                />
              ) : (
                <span className="text-[11.5px] text-muted/70 text-center px-2">
                  Belum ada logo
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => pilihLogo(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={logoSibuk}
                  onClick={() => logoInput.current?.click()}
                  className="bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 py-1.5 rounded-lg hover:bg-white transition-colors disabled:opacity-60"
                >
                  {logoSibuk
                    ? "Memproses..."
                    : logo
                      ? "Ganti Logo"
                      : "Pilih Logo"}
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={hapusLogo}
                    className="text-clay-600 text-[12.5px] font-medium px-2 py-1.5 hover:underline"
                  >
                    Hapus
                  </button>
                )}
              </div>

              <p className="text-[11.5px] text-muted leading-snug max-w-[42ch]">
                PNG atau JPG. Otomatis dikecilkan ke maksimal {LOGO_MAX_PX} px
                dan tercetak setinggi 16 mm di kop dokumen A4, jadi tidak perlu
                mengecilkannya sendiri. Latar transparan PNG dipertahankan.
              </p>

              {logo && (
                <p className="text-[11.5px] text-muted/80">
                  {logoBaru
                    ? `Hasil: ${logoBaru.lebar} x ${logoBaru.tinggi} px · ${formatBytes(logoBaru.bytes)}${
                        logoBaru.diratakan
                          ? " · transparansi diratakan ke putih"
                          : ""
                      }`
                    : `Tersimpan · ${formatBytes(logoBytes)}`}
                </p>
              )}
              {logoError && (
                <p className="text-clay-600 text-[11.5px]">{logoError}</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Alamat
          </label>
          <textarea
            value={form.alamat}
            onChange={(e) => set("alamat", e.target.value)}
            rows={2}
            placeholder="Alamat lengkap perusahaan"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              No. Telepon
            </label>
            <input
              value={form.no_telp}
              onChange={(e) => set("no_telp", e.target.value)}
              placeholder="021-xxx / 08xx"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="info@perusahaan.com"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              NPWP
            </label>
            <input
              value={form.npwp}
              onChange={(e) => set("npwp", e.target.value)}
              placeholder="xx.xxx.xxx.x-xxx.xxx"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Rekening Bank{" "}
            <span className="font-normal text-muted/70">(tampil di invoice)</span>
          </label>
          <input
            value={form.bank_info}
            onChange={(e) => set("bank_info", e.target.value)}
            placeholder="Misal: BCA - 7705299919 a.n. PT ..."
            className={inputCls}
          />
        </div>
      </div>

      {/* ===== Pajak (PPN) =====
          Model pajak menentukan apakah tagihan client bertambah atau tidak,
          jadi pilihannya ditulis sebagai kalimat utuh, bukan dropdown
          "Include / Exclude" yang gampang dipilih terbalik. */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Pajak (PPN)
          </h2>
          <p className="text-muted text-[12.5px] mt-1">
            Menentukan cara invoice menghitung pajak dari harga produk.
            Dokumen yang sudah terbit tidak ikut berubah, modelnya dibekukan
            di masing-masing dokumen.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              {
                key: "Exclude" as TaxMode,
                judul: "Harga belum termasuk pajak",
                desc: "PPN dihitung dari nilai setelah diskon lalu ditambahkan. Tagihan client bertambah.",
                contoh: "Harga 100.000, tagihan jadi 111.000",
              },
              {
                key: "Include" as TaxMode,
                judul: "Harga sudah termasuk pajak",
                desc: "Harga produk sudah final. PPN diurai dari harga supaya tetap tercatat, total tidak bertambah.",
                contoh: "Harga 100.000 tetap 100.000, PPN 9.909,91 di dalamnya",
              },
            ] as const
          ).map((m) => (
            <label
              key={m.key}
              className={`cursor-pointer rounded-xl border p-3.5 flex flex-col gap-1 transition-colors ${
                taxMode === m.key
                  ? "border-botanical-700 bg-botanical-100/50"
                  : "border-line bg-white/45 hover:bg-white/70"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tax_mode"
                  checked={taxMode === m.key}
                  onChange={() => {
                    setTaxMode(m.key);
                    setSaved(false);
                  }}
                  className="accent-[#2f4f3e]"
                />
                <span className="text-[13.5px] font-medium text-ink">
                  {m.judul}
                </span>
              </span>
              <span className="text-[12px] text-muted leading-snug">
                {m.desc}
              </span>
              <span className="text-[11.5px] text-muted/80">
                Contoh: {m.contoh}
              </span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4 items-start">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Tarif PPN (%)
            </label>
            <NumberInput
              value={taxPercent}
              onChange={(nilai) => {
                setTaxPercent(nilai);
                setSaved(false);
              }}
              placeholder="12"
              className={inputCls}
            />
            <p className="text-[11.5px] text-muted mt-1.5">
              Tarif menurut regulasi, 12% sejak 1 Januari 2025.
            </p>
          </div>

          <label className="cursor-pointer rounded-xl border border-line bg-white/45 p-3.5 flex flex-col gap-1 hover:bg-white/70 transition-colors">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dppNilaiLain}
                onChange={(e) => {
                  setDppNilaiLain(e.target.checked);
                  setSaved(false);
                }}
                className="accent-[#2f4f3e]"
              />
              <span className="text-[13.5px] font-medium text-ink">
                Pakai DPP Nilai Lain (11/12 harga jual)
              </span>
            </span>
            <span className="text-[12px] text-muted leading-snug">
              PMK 131/2024. Dasar pengenaannya bukan harga jual penuh,
              melainkan 11/12-nya, sehingga PPN yang dibayar efektif{" "}
              {persenStr(efektif)}% dari harga jual. Matikan hanya kalau
              aturan itu tidak berlaku lagi.
            </span>
          </label>
        </div>

        <p className="text-[12px] text-muted bg-white/50 rounded-lg px-3 py-2 leading-snug">
          {penjelasanTaxMode(pajak)}
        </p>
      </div>

      <div className="glass rounded-2xl p-6">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">
          Pengesahan Dokumen
        </h2>
        <p className="text-muted text-[12.5px] mt-1">
          Pengaturan kolom tanda tangan kini punya menu sendiri, bisa diatur
          per jenis dokumen (PO, Penerimaan, Produksi, Invoice) di{" "}
          <a
            href="/document-signing"
            className="text-botanical-700 font-medium hover:underline"
          >
            Settings → Document Signing
          </a>
          .
        </p>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
      {saved && (
        <p className="text-botanical-700 text-[12.5px] font-medium">
          ✓ Pengaturan tersimpan
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : "Simpan Pengaturan"}
      </button>
      {konfirmasi.dialog}
    </form>
  );
}
