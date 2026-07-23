"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import OrgSwitcher from "./OrgSwitcher";
import SignOutButton from "./SignOutButton";
import {
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { canAccessModule } from "@/lib/modules";
import { NAV, HUBS } from "@/lib/navConfig";

type OrgOption = { id: string; nama: string; slug: string; aktif: boolean };

export default function SidebarNav({
  profileNama,
  isSuperAdmin,
  role,
  allowedModules,
  organizations,
  currentOrgId,
  currentOrgNama,
}: {
  profileNama: string;
  isSuperAdmin: boolean;
  role: string;
  allowedModules: string[] | null;
  organizations: OrgOption[];
  currentOrgId: string;
  currentOrgNama: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // drawer HP
  const [collapsed, setCollapsed] = useState(false); // minimize desktop

  // Ingat preferensi minimize
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  }

  // Tutup drawer tiap pindah halaman
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const access = { isSuperAdmin, role, allowedModules };
  const visibleNav = NAV.filter((item) => {
    // Menu hub tampil kalau user punya akses ke salah satu bagiannya
    const pages = HUBS[item.href];
    if (pages) return pages.some((p) => canAccessModule(access, p.slice(1)));
    return canAccessModule(access, item.href.slice(1));
  });

  function isActive(href: string) {
    const pages = HUBS[href];
    if (pages) return pages.some((p) => pathname?.startsWith(p));
    return pathname?.startsWith(href);
  }

  return (
    <>
      {/* ===== Top bar (HP saja) ===== */}
      <div className="sm:hidden fixed top-0 inset-x-0 z-40 glass-dark text-white flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(true)} className="p-1 -ml-1" aria-label="Buka menu">
          <Menu size={22} />
        </button>
        <Logo size={22} />
        <div className="leading-tight">
          <div className="font-display font-semibold text-[13.5px]">
            Seawise Enterprise
          </div>
          <div className="text-[10px] text-white/50">{currentOrgNama}</div>
        </div>
      </div>

      {/* ===== Backdrop (HP saat drawer terbuka) ===== */}
      {open && (
        <div
          className="sm:hidden fixed inset-0 bg-black/45 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ===== Sidebar / Drawer ===== */}
      <aside
        className={`fixed sm:sticky top-0 z-50 sm:z-auto inset-y-0 left-0 flex-shrink-0 glass-dark text-white/80 flex flex-col p-4 h-screen sm:min-h-screen transform transition-all duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } sm:translate-x-0 overflow-y-auto w-[250px] ${
          collapsed ? "sm:w-[68px] sm:px-2" : "sm:w-[230px]"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-2.5 px-2 pb-4 pt-1 ${
            collapsed ? "sm:flex-col sm:px-0 sm:gap-3" : ""
          }`}
        >
          <Logo size={28} />
          <div className={`flex-1 ${collapsed ? "sm:hidden" : ""}`}>
            <div className="font-display font-semibold text-[15px] text-white leading-tight">
              Seawise Enterprise
            </div>
            <div className="text-[11px] text-white/50 tracking-wide">
              Industry Edition
            </div>
          </div>
          {/* Tombol minimize (desktop) */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Perlebar sidebar" : "Ciutkan sidebar"}
            className="hidden sm:block text-white/50 hover:text-white p-1 transition-colors"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          {/* Tombol tutup drawer (HP) */}
          <button
            onClick={() => setOpen(false)}
            className="sm:hidden text-white/60 hover:text-white p-1"
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>

        {isSuperAdmin && !collapsed && (
          <OrgSwitcher organizations={organizations} currentOrgId={currentOrgId} />
        )}

        <nav className="flex flex-col gap-0.5 flex-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all ${
                  active
                    ? "bg-white/15 text-white shadow-sm border border-white/10"
                    : "text-white/65 hover:bg-white/8 hover:text-white border border-transparent"
                } ${collapsed ? "sm:justify-center sm:px-0" : ""}`}
              >
                <Icon size={17} strokeWidth={2} />
                <span className={collapsed ? "sm:hidden" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className={`border-t border-white/10 pt-3 mt-2 px-2 ${
            collapsed ? "sm:px-0 sm:text-center" : ""
          }`}
        >
          <div className={collapsed ? "sm:hidden" : ""}>
            <div className="text-[13px] font-medium text-white">{currentOrgNama}</div>
            <div className="text-[11px] text-white/45">{profileNama}</div>
            <SignOutButton />
          </div>
          {collapsed && (
            <div className="hidden sm:block">
              <SignOutButton variant="icon" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
