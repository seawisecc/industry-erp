import {
  LayoutGrid,
  Boxes,
  ClipboardList,
  Briefcase,
  Package,
  HandCoins,
  BarChart3,
  Settings,
  Building2,
  FlaskConical,
  BookText,
  ShieldCheck,
  PackageCheck,
  Banknote,
  CalendarRange,
  Wrench,
  LayoutPanelLeft,
  PackageOpen,
  BadgeCheck,
  Contact,
  Store,
  FileText,
  ShoppingCart,
  IdCard,
  PenLine,
  ClipboardCheck,
  Zap,
  DatabaseZap,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type SubItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Butuh fitur berbayar tertentu supaya tampil. */
  needs?: ("qc" | "qa")[];
};

// Menu "hub": satu item mewakili beberapa halaman (navigasi detail di dalam halaman)
export const HUBS: Record<string, string[]> = {
  "/items": ["/items", "/materials", "/inci", "/qc-incoming"],
  "/purchase-orders": ["/purchase-orders", "/receivings", "/payments", "/ppic"],
  "/products": [
    "/products",
    "/services",
    "/production",
    "/finished-goods",
    "/qc-finished",
    "/qa-release",
  ],
  "/clients": [
    "/clients",
    "/consignments",
    "/sales-invoices",
    "/pos",
    "/sales-payments",
  ],
  "/settings": [
    "/settings",
    "/data-migration",
    "/users",
    "/document-signing",
    "/features",
    "/qc-parameters",
  ],
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/items", label: "Materials & Stock", icon: Boxes },
  { href: "/purchase-orders", label: "Purchasing", icon: ClipboardList },
  { href: "/suppliers", label: "Suppliers", icon: Briefcase },
  { href: "/products", label: "Products", icon: Package },
  { href: "/clients", label: "Sales", icon: HandCoins },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/companies", label: "Companies", icon: Building2 },
];

/** Label pendek modul untuk header dropup / bar HP. */
export const MODULE_TITLE: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/items": "Materials & Stock",
  "/purchase-orders": "Purchasing",
  "/products": "Products",
  "/clients": "Sales",
  "/settings": "Settings",
};

/** Sub-menu tiap modul (hub) — ditampilkan sebagai ikon di dropup HP. */
export const SUBMENUS: Record<string, SubItem[]> = {
  "/items": [
    { href: "/items", label: "Stock Items", icon: Boxes },
    { href: "/qc-incoming", label: "QC Incoming", icon: ShieldCheck, needs: ["qc"] },
    { href: "/materials", label: "Materials", icon: FlaskConical },
    { href: "/inci", label: "INCI Names", icon: BookText },
  ],
  "/purchase-orders": [
    { href: "/purchase-orders", label: "Purchase Order", icon: ClipboardList },
    { href: "/receivings", label: "Receiving", icon: PackageCheck },
    { href: "/payments", label: "Payments", icon: Banknote },
    { href: "/ppic", label: "PPIC", icon: CalendarRange },
  ],
  "/products": [
    { href: "/products", label: "Products", icon: Package },
    { href: "/services", label: "Services", icon: Wrench },
    { href: "/production", label: "Production", icon: LayoutPanelLeft },
    { href: "/finished-goods", label: "Finished Goods", icon: PackageOpen },
    { href: "/qc-finished", label: "QC Produk", icon: ShieldCheck, needs: ["qa", "qc"] },
    { href: "/qa-release", label: "QA Release", icon: BadgeCheck, needs: ["qa"] },
  ],
  "/clients": [
    { href: "/clients", label: "Clients", icon: Contact },
    { href: "/consignments", label: "Consignment", icon: Store },
    { href: "/sales-invoices", label: "Invoices", icon: FileText },
    { href: "/pos", label: "POS", icon: ShoppingCart },
    { href: "/sales-payments", label: "Payments", icon: Banknote },
  ],
  "/settings": [
    { href: "/settings", label: "Company", icon: IdCard },
    { href: "/document-signing", label: "Doc Signing", icon: PenLine },
    { href: "/qc-parameters", label: "Parameter QC", icon: ClipboardCheck, needs: ["qc"] },
    { href: "/features", label: "Features", icon: Zap },
    { href: "/data-migration", label: "Data Migrasi", icon: DatabaseZap },
    { href: "/users", label: "Users", icon: Users },
  ],
};

/** Menu utama yang tampil sebagai tab di bar bawah HP. */
export const PRIMARY_HREFS = [
  "/dashboard",
  "/items",
  "/purchase-orders",
  "/products",
  "/clients",
];
