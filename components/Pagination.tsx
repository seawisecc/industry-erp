"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTransition } from "react";
import type { PageInfo } from "@/lib/pagination";

/**
 * Navigasi halaman tabel. Nomor halaman disimpan di URL supaya
 * bisa di-refresh / di-share, dan tombol Kembali browser bekerja.
 */
export default function Pagination({ info }: { info: PageInfo }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (info.totalPages <= 1) return null;

  function goTo(page: number) {
    const sp = new URLSearchParams(params.toString());
    if (page <= 1) sp.delete("page");
    else sp.set("page", String(page));
    const qs = sp.toString();
    startTransition(() =>
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    );
  }

  const btn =
    "inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-line text-[12.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="print-hide flex items-center justify-between gap-3 mt-3 flex-wrap">
      <span className="text-[12px] text-muted">
        Halaman {info.page.toLocaleString("id-ID")} dari{" "}
        {info.totalPages.toLocaleString("id-ID")}
        {pending && " · memuat..."}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goTo(info.page - 1)}
          disabled={info.page <= 1 || pending}
          className={`${btn} hover:bg-white/50`}
        >
          <ChevronLeft size={15} /> Sebelumnya
        </button>
        <button
          type="button"
          onClick={() => goTo(info.page + 1)}
          disabled={info.page >= info.totalPages || pending}
          className={`${btn} hover:bg-white/50`}
        >
          Berikutnya <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
