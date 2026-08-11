import Link from "next/link";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { tanpaModul } from "@/lib/modules";
import { getFeatures } from "@/lib/featuresServer";
import { getNotifikasi, type NotifIkon, type Urgensi } from "@/lib/notifikasi";
import {
  PackageX,
  CalendarClock,
  ClipboardCheck,
  ShieldCheck,
  BadgeCheck,
  HandCoins,
  Banknote,
  ArrowRight,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

/**
 * Komponen ikon dipilih di sini, bukan dioper dari lib: lib/notifikasi.ts
 * cuma mengembalikan nama, supaya tidak ada komponen yang menyeberang
 * batas server/client sebagai nilai.
 */
const IKON: Record<NotifIkon, LucideIcon> = {
  stok: PackageX,
  expiry: CalendarClock,
  po: ClipboardCheck,
  qc: ShieldCheck,
  qa: BadgeCheck,
  piutang: HandCoins,
  hutang: Banknote,
};

const URGENSI_TONE: Record<Urgensi, string> = {
  kritis: "bg-clay-100 text-clay-600",
  peringatan: "bg-amber-100 text-amber-500",
};

export default async function NotificationsPage() {
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const belumPunyaModul = tanpaModul({
    isSuperAdmin,
    role: profile?.role || "",
    allowedModules: profile?.allowed_modules ?? null,
  });
  const features = await getFeatures(organizationId!);

  const grup = await getNotifikasi(
    organizationId!,
    {
      isSuperAdmin,
      role: profile?.role || "",
      allowedModules: profile?.allowed_modules ?? null,
    },
    features
  );

  const totalSemua = grup.reduce((s, g) => s + g.total, 0);
  const totalKritis = grup.reduce(
    (s, g) => s + g.items.filter((i) => i.urgensi === "kritis").length,
    0
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">
        Notifications
      </h1>
      <p className="text-muted text-sm mt-1">
        {totalSemua === 0
          ? "Semua beres, tidak ada yang menunggu tindakan."
          : `${totalSemua.toLocaleString("id-ID")} hal menunggu ditindak di ${grup.length} kelompok`}
        {totalKritis > 0 ? `, ${totalKritis} di antaranya sudah mendesak` : ""}.
        Hanya modul yang bisa kamu akses yang ditampilkan.
      </p>

      {/* Akun yang belum diberi modul apa pun mendarat di sini setelah
          login, karena inilah satu-satunya halaman yang dijamin bisa
          dibuka siapa pun. Tanpa keterangan ini dia cuma melihat layar
          yang sepi dan tidak tahu kenapa menunya kosong. */}
      {belumPunyaModul && (
        <div className="glass rounded-2xl p-5 mt-5 border-l-4 border-amber-500">
          <h2 className="font-display text-[15px] font-semibold text-ink mb-1">
            Akunmu belum diberi akses modul
          </h2>
          <p className="text-muted text-[13px] leading-relaxed">
            Kamu sudah berhasil masuk, tapi Admin perusahaan belum menentukan
            menu mana saja yang boleh kamu buka. Hubungi Admin supaya aksesnya
            diaktifkan. Sementara itu halaman ini tetap bisa kamu pantau.
          </p>
        </div>
      )}

      {grup.length === 0 ? (
        <div className="glass rounded-2xl p-10 mt-6 text-center">
          <div className="inline-flex bg-botanical-100 text-botanical-700 rounded-xl p-3 mb-4">
            <CheckCircle2 size={22} />
          </div>
          <h2 className="font-display text-lg font-semibold text-ink mb-1">
            Tidak ada yang perlu ditindak
          </h2>
          <p className="text-muted text-[13px] max-w-sm mx-auto leading-relaxed">
            Stok di atas minimum, tidak ada batch mendekati expiry, tidak ada
            dokumen menunggu persetujuan, dan tidak ada tagihan lewat tempo.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
          {grup.map((g) => {
            const Icon = IKON[g.ikon];
            const sisa = g.total - g.items.length;
            // Tinggi kartu dikunci supaya semuanya sejajar berapa pun isinya.
            // Yang memanjang daftarnya, bukan kartunya: kalau kartu ikut
            // memanjang, kelompok berisi 40 baris mendorong kelompok lain
            // keluar layar dan halaman ini berhenti bisa dipindai sekilas.
            return (
              <section
                key={g.key}
                className="glass rounded-2xl p-5 flex flex-col h-[26rem]"
              >
                <div className="flex items-start gap-3 mb-4 flex-shrink-0">
                  <div className="bg-botanical-100 text-botanical-700 rounded-xl p-2.5 flex-shrink-0">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-[15px] font-semibold text-ink">
                        {g.judul}
                      </h2>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-clay-100 text-clay-600 whitespace-nowrap">
                        {g.terpotong ? "≥" : ""}
                        {g.total.toLocaleString("id-ID")}
                      </span>
                    </div>
                    <p className="text-muted text-[12.5px] mt-0.5 leading-snug">
                      {g.deskripsi}
                    </p>
                  </div>
                </div>

                {/* -mr-2 pr-2: scrollbar menempel di tepi kartu, tidak
                    memotong teks. overscroll-contain supaya gulungan yang
                    mentok di sini tidak lanjut menggulung halaman. */}
                <ul className="flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-contain -mr-2 pr-2">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <Link
                        href={it.href}
                        className="flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/60 transition-colors"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            it.urgensi === "kritis"
                              ? "bg-clay-500"
                              : "bg-amber-500"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] text-ink truncate">
                            {it.label}
                          </span>
                          <span className="block text-[11.5px] text-muted truncate">
                            {it.detail}
                          </span>
                        </span>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${URGENSI_TONE[it.urgensi]}`}
                        >
                          {it.nilai}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2 flex-shrink-0">
                  <span className="text-[11.5px] text-muted">
                    {sisa > 0
                      ? `+${sisa.toLocaleString("id-ID")} lainnya`
                      : "Semua ditampilkan"}
                  </span>
                  <Link
                    href={g.href}
                    className="inline-flex items-center gap-1.5 text-botanical-700 text-[12.5px] font-medium hover:underline whitespace-nowrap"
                  >
                    {g.hrefLabel} <ArrowRight size={14} />
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
