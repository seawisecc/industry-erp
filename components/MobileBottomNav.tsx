"use client";

/* ============================================================
   Navigasi bawah khusus HP.
   - Bar berisi tab modul utama (Dashboard, Materials, dst).
   - Tombol grid di kanan membuka sub-menu modul yang SEDANG
     aktif sebagai ikon ringkas (mis. Materials & Stock →
     Stock Items, QC Incoming, Materials, INCI Names).
   Hanya tampil di layar kecil (sm:hidden).
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, X } from "lucide-react";
import { canAccessModule } from "@/lib/modules";
import {
  NAV,
  HUBS,
  SUBMENUS,
  MODULE_TITLE,
  type SubItem,
} from "@/lib/navConfig";

export default function MobileBottomNav({
  isSuperAdmin,
  role,
  allowedModules,
  hasQc,
  hasQa,
}: {
  isSuperAdmin: boolean;
  role: string;
  allowedModules: string[] | null;
  hasQc: boolean;
  hasQa: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Geser bar supaya tab aktif kelihatan (mis. Reports/Settings di kanan)
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [pathname]);

  const access = { isSuperAdmin, role, allowedModules };

  function canOpen(href: string) {
    return canAccessModule(access, href.slice(1));
  }
  function isActive(href: string) {
    const pages = HUBS[href];
    if (pages) return pages.some((p) => pathname?.startsWith(p));
    return pathname?.startsWith(href);
  }

  // Semua modul yang boleh diakses — bisa di-swipe ke kanan
  const tabs = NAV.filter((item) => {
    const pages = HUBS[item.href];
    if (pages) return pages.some((p) => canOpen(p));
    return canOpen(item.href);
  });

  // Modul yang sedang aktif berdasar URL → dari situ ambil sub-menunya
  const activeRoot =
    Object.keys(SUBMENUS).find((root) =>
      HUBS[root]?.some((p) => pathname?.startsWith(p))
    ) || null;

  const subItems: SubItem[] = activeRoot
    ? SUBMENUS[activeRoot].filter((s) => {
        if (!canOpen(s.href)) return false;
        if (s.needs?.includes("qc") && !hasQc) return false;
        if (s.needs?.includes("qa") && !hasQa) return false;
        return true;
      })
    : [];

  const showGrid = subItems.length > 1;

  return (
    <>
      {/* ===== Dropup sub-menu modul aktif ===== */}
      {open && showGrid && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-botanical-900/50 backdrop-blur-[2px] animate-[fadeIn_.15s_ease-out]" />
          <div
            className="relative glass rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl animate-[sheetUp_.22s_cubic-bezier(0.22,1,0.36,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-10 rounded-full bg-ink/15 mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
            <div className="flex items-center justify-between mb-4 mt-1">
              <h3 className="font-display text-[15px] font-semibold text-ink">
                {activeRoot ? MODULE_TITLE[activeRoot] : "Menu"}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink p-1"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {subItems.map((item) => (
                <Tile
                  key={item.href}
                  item={item}
                  active={pathname?.startsWith(item.href) ?? false}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Bar bawah ===== */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 pt-2 px-3 pointer-events-none"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
        }}
      >
        <div className="pointer-events-auto flex items-center gap-2 max-w-md mx-auto">
          <div
            ref={barRef}
            className="flex-1 min-w-0 rounded-full shadow-lg flex items-center gap-1 px-1.5 py-1.5 overflow-x-auto no-scrollbar bg-white/95 border border-line"
            style={{ WebkitBackdropFilter: "none", backdropFilter: "none" }}
          >
            {tabs.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={active ? activeRef : undefined}
                  className={`flex items-center gap-1.5 rounded-full transition-all flex-shrink-0 ${
                    active
                      ? "bg-botanical-700 text-white px-3.5 py-2"
                      : "text-ink/60 px-2.5 py-2"
                  }`}
                >
                  <Icon size={21} strokeWidth={2.2} />
                  {active && (
                    <span className="text-[12.5px] font-semibold whitespace-nowrap">
                      {shortLabel(item.label)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Tombol sub-menu modul aktif (ikon grid) */}
          {showGrid && (
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label="Sub-menu modul"
              className={`flex-shrink-0 w-[52px] h-[52px] rounded-full shadow-lg flex items-center justify-center text-white transition-all active:scale-95 ${
                open ? "bg-botanical-800" : "bg-botanical-700"
              }`}
            >
              {open ? <X size={24} strokeWidth={2.6} /> : <LayoutGrid size={23} strokeWidth={2.4} />}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

function Tile({ item, active }: { item: SubItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex flex-col items-center gap-2 rounded-2xl transition-colors active:opacity-70"
    >
      <span
        className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-sm transition-colors ${
          active
            ? "bg-botanical-700 text-white"
            : "bg-botanical-100 text-botanical-700"
        }`}
      >
        <Icon size={23} strokeWidth={2.2} />
      </span>
      <span
        className={`text-[11px] font-medium text-center leading-tight ${
          active ? "text-botanical-700" : "text-ink/75"
        }`}
      >
        {item.label}
      </span>
    </Link>
  );
}

function shortLabel(label: string) {
  if (label === "Materials & Stock") return "Materials";
  return label;
}
