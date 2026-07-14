"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { canAccessModule } from "@/lib/modules";

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

  const ok = canAccessModule({ isSuperAdmin, role, allowedModules }, moduleKey);

  if (!ok) {
    return (
      <div className="glass rounded-2xl p-10 max-w-md mx-auto mt-16 text-center">
        <div className="inline-flex bg-clay-100 text-clay-600 rounded-xl p-3 mb-4">
          <ShieldAlert size={22} />
        </div>
        <h1 className="font-display text-xl font-semibold text-ink mb-2">
          Tidak Punya Akses
        </h1>
        <p className="text-muted text-sm mb-5">
          Akunmu belum diberi akses ke modul ini. Hubungi Admin perusahaan untuk
          mengaktifkannya.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
