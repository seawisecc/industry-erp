"use client";

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

  const visibleNav = NAV.filter((item) =>
    canAccessModule(
      { isSuperAdmin, role, allowedModules },
      item.href.slice(1)
    )
  );

  return (
   <aside className="w-[230px] flex-shrink-0 glass-dark text-white/80 flex flex-col p-4 min-h-screen sticky top-0 h-screen">
      <div className="flex items-center gap-2.5 px-2 pb-4 pt-1">
        <Logo size={28} />
        <div>
          <div className="font-display font-semibold text-[15px] text-white leading-tight">
            Seawise Enterprise
          </div>
          <div className="text-[11px] text-white/50 tracking-wide">Industry Edition</div>
        </div>
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
  );
}