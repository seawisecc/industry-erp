"use client";

/* ============================================================
   Penjaga akses per modul.

   Layar penolakannya SELALU menawarkan jalan keluar yang benar-benar
   bisa dibuka user ini. Versi sebelumnya menawarkan "Kembali ke
   Dashboard", padahal dashboard adalah modul biasa yang bisa tidak
   diberikan: user yang tidak punya akses dashboard menekan tombolnya
   lalu kembali ke layar penolakan yang sama, berputar tanpa jalan
   keluar kecuali lewat sidebar.

   Karena itu tujuannya dihitung dari hak aksesnya sendiri lewat
   landingPath(), sumber yang sama dengan yang dipakai pendaratan
   setelah login.

   Layar ini sekarang cuma muncul untuk navigasi yang memang keliru
   (tautan lama, URL yang diketik manual, bookmark). Jalur normal
   sesudah login tidak pernah sampai ke sini.
   ============================================================ */

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import {
  MODULES,
  canAccessModule,
  landingLabel,
  landingPath,
  tanpaModul,
} from "@/lib/modules";

export default function AccessGuard({
  isSuperAdmin,
  role,
  allowedModules,
  children,
}: {
  isSuperAdmin: boolean;
  role: string;
  allowedModules: string[] | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const moduleKey = (pathname || "/").split("/")[1] || "dashboard";

  const akses = { isSuperAdmin, role, allowedModules };
  const ok = canAccessModule(akses, moduleKey);

  if (!ok) {
    const namaModul =
      MODULES.find((m) => m.key === moduleKey)?.label ?? "halaman ini";
    const kosong = tanpaModul(akses);

    return (
      <div className="glass rounded-2xl p-10 max-w-md mx-auto mt-16 text-center">
        <div className="inline-flex bg-clay-100 text-clay-600 rounded-xl p-3 mb-4">
          <ShieldAlert size={22} />
        </div>
        <h1 className="font-display text-xl font-semibold text-ink mb-2">
          Tidak Punya Akses
        </h1>
        <p className="text-muted text-sm mb-5 leading-relaxed">
          {kosong ? (
            <>
              Akunmu belum diberi akses ke modul mana pun. Hubungi Admin
              perusahaan untuk mengaktifkannya.
            </>
          ) : (
            <>
              Akunmu belum diberi akses ke <b>{namaModul}</b>. Hubungi Admin
              perusahaan kalau memang butuh, atau lanjutkan ke menu yang sudah
              bisa kamu buka.
            </>
          )}
        </p>
        <Link
          href={landingPath(akses)}
          className="inline-block bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors"
        >
          Buka {landingLabel(akses)}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
