/* ============================================================
   Pintu masuk aplikasi.

   Tidak lagi melempar semua orang ke /dashboard. Dashboard adalah
   modul biasa yang bisa tidak diberikan ke seseorang, dan melempar
   ke sana berarti sebagian user disambut layar "Tidak Punya Akses"
   tepat setelah memasukkan password.

   Pendaratannya dihitung di SINI, di server, bukan di halaman login.
   Halaman login berjalan di browser dan tidak tahu hak akses siapa
   pun sampai sesinya jadi; kalau perhitungannya ditaruh di sana, dia
   harus menunggu satu permintaan tambahan dan user melihat kedipan
   halaman perantara.
   ============================================================ */

import { redirect } from "next/navigation";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { landingPath } from "@/lib/modules";

export default async function Home() {
  const { profile, isSuperAdmin } = await getEffectiveOrg();

  redirect(
    landingPath({
      isSuperAdmin,
      role: profile?.role || "",
      allowedModules: profile?.allowed_modules ?? null,
    })
  );
}
