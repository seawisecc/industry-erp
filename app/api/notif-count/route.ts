import { NextResponse } from "next/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { getNotifikasi } from "@/lib/notifikasi";

/* ============================================================
   Jumlah notifikasi untuk badge di menu Notifications.

   Sengaja route terpisah yang diambil KLIEN (lib/notifBadge.ts), bukan
   dihitung di layout: sidebar dirender di tiap halaman, dan menjalankan
   query notifikasi di jalur render berarti tiap navigasi menunggu query
   yang hasilnya cuma satu angka kecil di pojok. Diambil di belakang,
   halaman tidak pernah menunggu badge.

   Isinya dihitung oleh getNotifikasi yang SAMA dengan halaman
   Notifications, dengan hak akses user yang sama, jadi angka di badge
   tidak bisa berbeda dengan isi halamannya.
   ============================================================ */

export async function GET() {
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  if (!profile || !organizationId) {
    return NextResponse.json({ total: 0, kritis: false, terpotong: false });
  }

  const features = await getFeatures(organizationId);
  const grup = await getNotifikasi(
    organizationId,
    {
      isSuperAdmin,
      role: profile.role || "",
      allowedModules: profile.allowed_modules ?? null,
    },
    features
  );

  return NextResponse.json(
    {
      total: grup.reduce((s, g) => s + g.total, 0),
      kritis: grup.some((g) => g.items.some((i) => i.urgensi === "kritis")),
      terpotong: grup.some((g) => g.terpotong),
    },
    // Isinya milik satu user di satu organisasi, tidak boleh disimpan
    // di cache mana pun di antara browser dan server.
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
