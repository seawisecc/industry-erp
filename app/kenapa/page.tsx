"use client";

/* ============================================================
   /kenapa — halaman marketing publik (tanpa login)
   "Kenapa harus pakai Seawise Enterprise Apps?"
   Gaya: Apple-like — tipografi besar, banyak ruang, section
   gelap/terang bergantian, animasi reveal halus saat scroll.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import {
  ClipboardCheck,
  PackageCheck,
  FlaskConical,
  Calculator,
  Store,
  CalendarClock,
  BarChart3,
  Users,
  DatabaseBackup,
  ShieldCheck,
  ListChecks,
  BadgeCheck,
  ArrowRight,
  Mail,
  MessageCircle,
} from "lucide-react";

/* ---------- KONFIGURASI — ganti di sini saja ---------- */
const WA_NUMBER = "628123757759"; // TODO: ganti dengan nomor WhatsApp bisnis
const CONTACT_EMAIL = "seawise.cc@gmail.com";
const HARGA_AKTIVASI = "Rp 25.000.000";
const HARGA_MAINTENANCE = "Rp 9.500.000";
const HARGA_BUNDLE = "Rp 35.000.000"; // Standar + Industri+ (MES · QC · QA)

const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
  "Halo, saya tertarik dengan Seawise Enterprise Apps (Industry Edition). Boleh minta info lebih lanjut?"
)}`;
const EMAIL_LINK = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Tanya Seawise Enterprise Apps — Industry Edition"
)}`;

/* ---------- Reveal on scroll (hormati prefers-reduced-motion) ---------- */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(28px)",
        transition: `opacity 800ms cubic-bezier(.22,1,.36,1) ${delay}ms, transform 800ms cubic-bezier(.22,1,.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Data konten ---------- */
const FLOW = [
  {
    no: "01",
    title: "Beli",
    desc: "PO dibuat, disetujui berjenjang oleh user yang berwenang, lalu dicetak profesional. Tidak ada pembelian tanpa persetujuan.",
    chip: "PO-0726-001 · Disetujui",
  },
  {
    no: "02",
    title: "Terima",
    desc: "Barang datang tercatat sebagai lot ber-expiry dengan harga aktual. Term of payment otomatis menghitung jatuh tempo hutang.",
    chip: "LOT SC-0143 · exp 03/2027",
  },
  {
    no: "03",
    title: "Produksi",
    desc: "Plan → timbang real vs teoritis → hasil. Stok terpotong FEFO dari lot expiry terdekat, dan HPP dihitung dari harga lot yang benar-benar terpakai.",
    chip: "BATCH BS-26-018 · HPP Rp 8.412/pcs",
  },
  {
    no: "04",
    title: "Jual",
    desc: "Konsinyasi, invoice pajak / non-pajak, sampai POS walk-in — semua memotong stok produk jadi dan tercatat sebagai piutang.",
    chip: "INV.202607-014 · Lunas",
  },
  {
    no: "05",
    title: "Laporan",
    desc: "Setiap transaksi di atas otomatis menjadi laporan penjualan, pembelian, produksi, dan mutasi stok — siap cetak dengan kop perusahaan.",
    chip: "Laporan Juli 2026 · siap cetak",
  },
];

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Purchasing dengan approval",
    desc: "Alur PO Dibuat → Disetujui → Dikirim → Diterima. Hak menyetujui bisa dibatasi per user, lengkap dengan cetak PO resmi.",
  },
  {
    icon: PackageCheck,
    title: "Stok FEFO & Expiry Control",
    desc: "Produksi otomatis memakai lot dengan expiry terdekat. Radar expiry ≤ 60 hari, dengan opsi re-test atau pemusnahan yang ter-audit.",
  },
  {
    icon: FlaskConical,
    title: "Formula % & INCI otomatis",
    desc: "Formula dalam persentase terhadap kg bulk. Deklarasi INCI tersusun otomatis, urut dari kandungan terbesar ke terkecil.",
  },
  {
    icon: Calculator,
    title: "HPP real per batch",
    desc: "Bukan estimasi — HPP dihitung dari timbangan real dan harga lot yang benar-benar terpakai, termasuk adjusting dan kemasan.",
  },
  {
    icon: Store,
    title: "Penjualan lengkap",
    desc: "Konsinyasi dengan stok di lokasi client, proforma & invoice pajak / non-pajak sesuai template resmi, plus POS untuk walk-in.",
  },
  {
    icon: CalendarClock,
    title: "Reminder jatuh tempo",
    desc: "Hutang supplier dan piutang penjualan terpantau dengan term of payment — yang lewat jatuh tempo langsung disorot.",
  },
  {
    icon: BarChart3,
    title: "Dashboard & laporan",
    desc: "Grafik pembelian vs penjualan, yield produksi, dan produk terlaris. Empat laporan periode siap cetak dengan kop perusahaan.",
  },
  {
    icon: Users,
    title: "Hak akses per user",
    desc: "Tentukan sendiri modul apa saja yang boleh diakses tiap karyawan, termasuk izin khusus seperti menyetujui PO atau membuat plan produksi.",
  },
  {
    icon: DatabaseBackup,
    title: "Migrasi & backup data",
    desc: "Pindahkan data lama lewat import CSV — supplier, bahan, client, produk. Seluruh database bisa di-backup kapan saja.",
  },
];

const INDUSTRI = [
  {
    icon: ListChecks,
    name: "MES",
    full: "Manufacturing Execution System",
    desc: "Cara pembuatan tiap formula tampil sebagai checklist digital saat produksi — operator mencentang langkah demi langkah. Batch record dua tahap (Catatan Pengolahan & Catatan Pengemasan) tersusun otomatis, lengkap dengan rekonsiliasi kemasan.",
    chip: "BATCH BS-26-018 · 12/12 langkah ✓",
  },
  {
    icon: FlaskConical,
    name: "QC",
    full: "Quality Control",
    desc: "Barang datang masuk karantina — tidak bisa dipakai produksi sebelum lulus uji. Lembar pengujian digital untuk bahan baku, bahan kemas, IPC, dan produk jadi; spesifikasi tersimpan per bahan dan terisi otomatis di pengujian berikutnya.",
    chip: "LOT SC-0143 · Released QC",
  },
  {
    icon: BadgeCheck,
    name: "QA",
    full: "Quality Assurance",
    desc: "Batch tidak bisa dijual sebelum diluluskan QA. Seluruh bukti — riwayat uji bahan, IPC, uji produk jadi, batch record — dalam satu layar, ditutup checklist pelulusan (izin edar, label, no. batch, expiry) dan Certificate of Analysis siap cetak.",
    chip: "BATCH BS-26-018 · Released + CoA",
  },
];

const NAV = [
  { href: "#alur", label: "Alur" },
  { href: "#fitur", label: "Fitur" },
  { href: "#industri", label: "Industri+" },
  { href: "#harga", label: "Harga" },
  { href: "#kontak", label: "Kontak" },
];

export default function KenapaPage() {
  return (
    <div className="text-ink">
      {/* ================= NAV ================= */}
      <header className="fixed top-0 inset-x-0 z-50 glass border-b border-white/40">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/kenapa" className="flex items-center gap-2.5">
            <div className="bg-botanical-900 rounded-lg p-1.5">
              <Logo size={18} />
            </div>
            <span className="font-display font-semibold text-[14.5px]">
              Seawise Enterprise
              <span className="hidden sm:inline text-muted font-normal">
                {" "}
                — Industry Edition
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-5">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="hidden md:inline text-[13px] text-muted hover:text-ink transition-colors"
              >
                {n.label}
              </a>
            ))}
            <Link
              href="/login"
              className="text-[13px] font-medium bg-botanical-900 text-white px-4 py-1.5 rounded-full hover:bg-botanical-700 transition-colors"
            >
              Masuk
            </Link>
          </nav>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(900px 500px at 80% -10%, rgba(193, 98, 61, 0.25) 0%, transparent 55%), radial-gradient(700px 500px at 10% 110%, rgba(47, 77, 58, 0.6) 0%, transparent 60%), linear-gradient(160deg, #16261D 0%, #1E3327 60%, #16261D 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 pt-40 pb-28 sm:pt-48 sm:pb-36 text-center">
          <Reveal>
            <div className="text-[11.5px] uppercase tracking-[0.25em] text-amber-500 font-semibold mb-6">
              Seawise Enterprise Apps — Industry Edition
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="font-display font-semibold text-white leading-[1.05] text-[clamp(38px,7vw,76px)] tracking-tight">
              Pabrik Anda,
              <br />
              <span className="text-amber-500">dalam satu sistem.</span>
            </h1>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-7 text-white/70 text-[16px] sm:text-[18px] max-w-2xl mx-auto leading-relaxed">
              Dari purchase order bahan baku sampai invoice penjualan — pembelian,
              stok FEFO, formula, produksi, HPP real, dan penjualan terhubung dalam
              satu sumber data. Dibuat khusus untuk industri.
            </p>
          </Reveal>
          <Reveal delay={340}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#kontak"
                className="inline-flex items-center gap-2 bg-white text-botanical-900 font-medium text-[14.5px] px-7 py-3 rounded-full hover:bg-amber-100 transition-colors"
              >
                Hubungi Kami <ArrowRight size={16} />
              </a>
              <a
                href="#alur"
                className="inline-flex items-center gap-2 text-white/85 font-medium text-[14.5px] px-7 py-3 rounded-full border border-white/25 hover:bg-white/10 transition-colors"
              >
                Lihat Cara Kerjanya
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= KLAIM STRIP ================= */}
      <section className="max-w-6xl mx-auto px-5 py-16 sm:py-20">
        <Reveal>
          <p className="text-center font-display text-[clamp(20px,3.2vw,30px)] font-medium leading-snug max-w-3xl mx-auto">
            Spreadsheet terpisah, stok tidak cocok, HPP hanya perkiraan,{" "}
            <span className="text-clay-600">
              masalah klasik pabrik yang tumbuh.
            </span>{" "}
            Seawise menghubungkan semuanya sejak barang dibeli sampai terjual.
          </p>
        </Reveal>
      </section>

      {/* ================= ALUR (signature) ================= */}
      <section id="alur" className="max-w-6xl mx-auto px-5 pb-24 sm:pb-32 scroll-mt-20">
        <Reveal>
          <div className="text-[11.5px] uppercase tracking-[0.25em] text-clay-600 font-semibold mb-3">
            Alur satu batch
          </div>
          <h2 className="font-display font-semibold text-[clamp(28px,4.5vw,44px)] leading-tight mb-4">
            Ikuti perjalanan satu batch,
            <br className="hidden sm:block" /> dari PO sampai laporan.
          </h2>
          <p className="text-muted text-[15px] max-w-xl leading-relaxed">
            Setiap tahap di pabrik meninggalkan dokumen. Seawise merangkainya jadi
            satu benang merah — angka yang sama dari awal sampai akhir.
          </p>
        </Reveal>

        <div className="mt-12 flex flex-col gap-4">
          {FLOW.map((f, i) => (
            <Reveal key={f.no} delay={i * 60}>
              <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                <div className="font-display text-[34px] sm:text-[40px] font-semibold text-botanical-700/30 leading-none w-16 shrink-0">
                  {f.no}
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-[19px] font-semibold mb-1.5">
                    {f.title}
                  </h3>
                  <p className="text-muted text-[14px] leading-relaxed max-w-2xl">
                    {f.desc}
                  </p>
                </div>
                <div className="shrink-0">
                  <span className="inline-flex font-mono text-[11.5px] bg-botanical-900 text-botanical-100 px-3.5 py-2 rounded-lg whitespace-nowrap">
                    {f.chip}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= FITUR GRID ================= */}
      <section
        id="fitur"
        className="relative scroll-mt-0"
        style={{
          background:
            "radial-gradient(800px 400px at 90% 0%, rgba(47, 77, 58, 0.5) 0%, transparent 55%), linear-gradient(180deg, #16261D 0%, #1E3327 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 py-24 sm:py-32">
          <Reveal>
            <div className="text-[11.5px] uppercase tracking-[0.25em] text-amber-500 font-semibold mb-3">
              Fitur
            </div>
            <h2 className="font-display font-semibold text-white text-[clamp(28px,4.5vw,44px)] leading-tight mb-14">
              Semua yang pabrik butuhkan.
              <br className="hidden sm:block" /> Tidak ada yang tidak perlu.
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <div className="h-full rounded-2xl p-6 bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] transition-colors">
                  <div className="inline-flex rounded-xl p-2.5 bg-botanical-100/10 text-amber-500 mb-4">
                    <f.icon size={20} />
                  </div>
                  <h3 className="text-white font-display text-[16.5px] font-semibold mb-2">
                    {f.title}
                  </h3>
                  <p className="text-white/60 text-[13.5px] leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* keamanan */}
          <Reveal delay={120}>
            <div className="mt-6 rounded-2xl p-6 sm:p-8 bg-white/[0.06] border border-white/10 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="inline-flex rounded-xl p-3 bg-botanical-100/10 text-amber-500 shrink-0 self-start">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 className="text-white font-display text-[16.5px] font-semibold mb-1.5">
                  Data perusahaan Anda, milik Anda sendiri
                </h3>
                <p className="text-white/60 text-[13.5px] leading-relaxed max-w-3xl">
                  Setiap perusahaan berjalan di ruang data yang terisolasi penuh —
                  tidak ada data yang bisa dilihat perusahaan lain. Formula dan
                  harga adalah rahasia dagang Anda; sistem kami memperlakukannya
                  seperti itu.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= INDUSTRI+ (MES · QC · QA) ================= */}
      <section id="industri" className="max-w-6xl mx-auto px-5 py-24 sm:py-32 scroll-mt-14">
        <Reveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-clay-600/30 bg-clay-100/50 px-4 py-1.5 text-[11.5px] uppercase tracking-[0.2em] text-clay-600 font-semibold mb-5">
              Paket Industri+ · Add-on
            </div>
            <h2 className="font-display font-semibold text-[clamp(28px,4.5vw,44px)] leading-tight">
              Siap audit.
              <br className="hidden sm:block" /> Mutu terkunci di dalam sistem.
            </h2>
            <p className="text-muted text-[15px] mt-4 max-w-2xl mx-auto leading-relaxed">
              Tiga modul industri yang membuat mutu bukan sekadar SOP di atas
              kertas: bahan tidak bisa dipakai sebelum lulus QC, produksi
              mengikuti checklist digital, dan produk tidak bisa dijual sebelum
              diluluskan QA. Jejak dokumennya lengkap — dari lembar uji sampai
              Certificate of Analysis.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {INDUSTRI.map((m, i) => (
            <Reveal key={m.name} delay={i * 100}>
              <div className="h-full glass rounded-3xl p-7 flex flex-col border border-clay-600/15">
                <div className="flex items-center gap-3 mb-4">
                  <div className="inline-flex rounded-xl p-2.5 bg-botanical-700 text-white">
                    <m.icon size={20} />
                  </div>
                  <div>
                    <div className="font-display text-[19px] font-semibold leading-none">
                      {m.name}
                    </div>
                    <div className="text-muted text-[11.5px] mt-1">{m.full}</div>
                  </div>
                </div>
                <p className="text-ink/75 text-[13.5px] leading-relaxed flex-1">
                  {m.desc}
                </p>
                <div className="mt-5 inline-flex self-start rounded-lg bg-botanical-100/70 px-3 py-1.5 font-mono text-[11px] text-botanical-700">
                  {m.chip}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <p className="text-center text-muted text-[13px] mt-8">
            Ketiga modul dibundel dalam satu paket dan diaktifkan langsung di
            akun perusahaan Anda — tanpa instalasi terpisah.
          </p>
        </Reveal>
      </section>

      {/* ================= HARGA ================= */}
      <section id="harga" className="max-w-6xl mx-auto px-5 py-24 sm:py-32 scroll-mt-14">
        <Reveal>
          <div className="text-center mb-14">
            <div className="text-[11.5px] uppercase tracking-[0.25em] text-clay-600 font-semibold mb-3">
              Investasi
            </div>
            <h2 className="font-display font-semibold text-[clamp(28px,4.5vw,44px)] leading-tight">
              Sederhana dan transparan.
            </h2>
            <p className="text-muted text-[15px] mt-4 max-w-lg mx-auto leading-relaxed">
              Satu kali biaya aktivasi — pilih paket sesuai kebutuhan pabrik —
              lalu biaya pemeliharaan tahunan yang sama untuk semua paket. Tanpa
              biaya per user, tanpa biaya tersembunyi.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl mx-auto items-stretch">
          <Reveal delay={60}>
            <div className="h-full glass rounded-3xl p-8 flex flex-col">
              <div className="text-[11.5px] uppercase tracking-[0.2em] text-clay-600 font-semibold mb-4">
                Paket Standar · sekali bayar
              </div>
              <div className="font-display text-[clamp(30px,4vw,40px)] font-semibold leading-none">
                {HARGA_AKTIVASI}
              </div>
              <ul className="mt-8 flex flex-col gap-3 text-[13.5px] text-ink/80 flex-1">
                {[
                  "Seluruh modul ERP: pembelian, stok FEFO, produksi & HPP, penjualan, laporan",
                  "Setup sistem & akun perusahaan Anda",
                  "Migrasi data awal (supplier, bahan, produk, client)",
                  "Training tim sampai lancar",
                  "Maintenance tahun pertama sudah termasuk",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <span className="text-botanical-700 mt-0.5">✓</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div
              className="relative h-full rounded-3xl p-8 text-white flex flex-col"
              style={{
                background:
                  "radial-gradient(500px 300px at 80% 0%, rgba(193, 98, 61, 0.35) 0%, transparent 60%), linear-gradient(160deg, #16261D 0%, #2F4D3A 120%)",
              }}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-clay-600 text-white text-[10.5px] font-semibold uppercase tracking-[0.15em] px-4 py-1.5 whitespace-nowrap shadow-md">
                Siap Audit
              </div>
              <div className="text-[11.5px] uppercase tracking-[0.2em] text-amber-500 font-semibold mb-4">
                Paket Industri+ · sekali bayar
              </div>
              <div className="font-display text-[clamp(30px,4vw,40px)] font-semibold leading-none">
                {HARGA_BUNDLE}
              </div>
              <ul className="mt-8 flex flex-col gap-3 text-[13.5px] text-white/85 flex-1">
                {[
                  "Semua yang ada di Paket Standar",
                  "Manufacturing Execution System (MES), checklist produksi digital & batch record 2 tahap",
                  "Quality Control (QC), karantina bahan + lembar pengujian digital",
                  "Quality Assurance (QA), pelulusan batch + Certificate of Analysis",
                  "Training tambahan untuk tim QC & QA",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <span className="text-amber-500 mt-0.5">✓</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={220}>
            <div className="h-full glass rounded-3xl p-8 flex flex-col">
              <div className="text-[11.5px] uppercase tracking-[0.2em] text-clay-600 font-semibold mb-4">
                Maintenance · per tahun
              </div>
              <div className="font-display text-[clamp(30px,4vw,40px)] font-semibold leading-none">
                {HARGA_MAINTENANCE}
                <span className="text-[15px] text-muted font-normal"> /tahun</span>
              </div>
              <ul className="mt-8 flex flex-col gap-3 text-[13.5px] text-ink/80 flex-1">
                {[
                  "Satu harga untuk semua paket",
                  "Berlaku mulai tahun kedua",
                  "Hosting cepat & backup data rutin",
                  "Dukungan langsung saat ada kendala",
                  "Update fitur berkelanjutan",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <span className="text-botanical-700 mt-0.5">✓</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={240}>
          <p className="text-center text-muted text-[12.5px] mt-8">
            Kebutuhan khusus atau skala lebih besar? Hubungi kami untuk penawaran
            yang disesuaikan.
          </p>
        </Reveal>
      </section>

      {/* ================= CTA KONTAK ================= */}
      <section
        id="kontak"
        className="relative overflow-hidden scroll-mt-0"
        style={{
          background:
            "radial-gradient(700px 400px at 50% 120%, rgba(193, 98, 61, 0.3) 0%, transparent 60%), linear-gradient(180deg, #1E3327 0%, #16261D 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 py-24 sm:py-32 text-center">
          <Reveal>
            <h2 className="font-display font-semibold text-white text-[clamp(30px,5vw,52px)] leading-tight">
              Siap merapikan pabrik Anda?
            </h2>
            <p className="text-white/65 text-[15.5px] mt-5 max-w-xl mx-auto leading-relaxed">
              Ceritakan proses pabrik Anda — kami tunjukkan bagaimana Seawise
              menjalankannya. Demo langsung, tanpa komitmen.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white text-botanical-900 font-medium text-[14.5px] px-7 py-3 rounded-full hover:bg-amber-100 transition-colors"
              >
                <MessageCircle size={17} /> Chat WhatsApp
              </a>
              <a
                href={EMAIL_LINK}
                className="inline-flex items-center gap-2 text-white/85 font-medium text-[14.5px] px-7 py-3 rounded-full border border-white/25 hover:bg-white/10 transition-colors"
              >
                <Mail size={17} /> {CONTACT_EMAIL}
              </a>
            </div>
          </Reveal>
        </div>

        {/* footer */}
        <footer className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12.5px] text-white/45">
            <div className="flex items-center gap-2">
              <Logo size={15} />
              <span>
                Seawise Enterprise Apps — Industry Edition ·{" "}
                {new Date().getFullYear()}
              </span>
            </div>
            <Link href="/login" className="hover:text-white/80 transition-colors">
              Masuk ke aplikasi →
            </Link>
          </div>
        </footer>
      </section>
    </div>
  );
}
