"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import OrgSwitcher from "./OrgSwitcher";
import SignOutButton from "./SignOutButton";
import {
  LayoutGrid,
  Boxes,
  ClipboardList,
  PackageCheck,
  Briefcase,
  FlaskConical,
  BookText,
  Package,
  LayoutPanelLeft,
  Users,
  Settings,
  Building2,
  Menu,
  X,
} from "lucide-react";
import { canAccessModule } from "@/lib/modules";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/items", label: "Stok Bahan", icon: Boxes },
  { href: "/purchase-orders", label: "Purchase Order", icon: ClipboardList },
  { href: "/receivings", label: "Receiving", icon: PackageCheck },
  { href: "/suppliers", label: "Supplier", icon: Briefcase },
  { href: "/materials", label: "Material", icon: FlaskConical },
  { href: "/inci", label: "INCI Name", icon: BookText },
  { href: "/products", label: "Produk", icon: Package },
  { href: "/production", label: "Produksi", icon: LayoutPanelLeft },
  { href: "/users", label: "Pengguna", icon: Users },
  { href: "/settings", label: "Pengaturan", icon: Settings },
  { href: "/companies", label: "Companies", icon: Building2 },
];

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
  const [open, setOpen] = useState(false);

  // Tutup drawer tiap pindah halaman
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const visibleNav = NAV.filter((item) =>
    canAccessModule({ isSuperAdmin, role, allowedModules }, item.href.slice(1))
  );

  return (
    <>
      {/* ===== Top bar (HP saja) ===== */}
      <div className="sm:hidden fixed top-0 inset-x-0 z-40 glass-dark text-white flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          className="p-1 -ml-1"
          aria-label="Buka menu"
        >
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
        className={`fixed sm:sticky top-0 z-50 sm:z-auto inset-y-0 left-0 w-[250px] sm:w-[230px] flex-shrink-0 glass-dark text-white/80 flex flex-col p-4 h-screen sm:min-h-screen transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } sm:translate-x-0 overflow-y-auto`}
      >
        <div className="flex items-center gap-2.5 px-2 pb-4 pt-1">
          <Logo size={28} />
          <div className="flex-1">
            <div className="font-display font-semibold text-[15px] text-white leading-tight">
              Seawise Enterprise
            </div>
            <div className="text-[11px] text-white/50 tracking-wide">
              Industry Edition
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="sm:hidden text-white/60 hover:text-white p-1"
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>

        {isSuperAdmin && (
          <OrgSwitcher organizations={organizations} currentOrgId={currentOrgId} />
        )}

        <nav className="flex flex-col gap-0.5 flex-1">
          {visibleNav.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all ${
                  active
                    ? "bg-white/15 text-white shadow-sm border border-white/10"
                    : "text-white/65 hover:bg-white/8 hover:text-white border border-transparent"
                }`}
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 pt-3 mt-2 px-2">
          <div className="text-[13px] font-medium text-white">{currentOrgNama}</div>
          <div className="text-[11px] text-white/45">{profileNama}</div>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
