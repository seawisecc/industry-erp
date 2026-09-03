import {
  LayoutGrid,
  Bell,
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
  PackageMinus,
  Undo2,
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
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

/* Kelompok menu sidebar.

   Urutannya di sini yang menentukan urutan di layar, dan itu SATU-SATUNYA
   akibatnya: halaman pendaratan sesudah login dihitung dari urutan MODULES
   di lib/modules.ts, bukan dari sini, jadi menata ulang NAV tidak memindahkan
   siapa pun ke halaman lain. */
export const NAV_GRUP = ["Operasional", "Analisis", "Administrasi"] as const;

export type NavGrup = (typeof NAV_GRUP)[number];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  grup: NavGrup;
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
  "/items": [
    "/items",
    "/material-issues",
    "/stock-opname",
    "/materials",
    "/inci",
    "/qc-incoming",
  ],
  "/purchase-orders": [
    "/purchase-orders",
    "/receivings",
    "/purchase-returns",
    "/payments",
    "/ppic",
  ],
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
    "/activity-logs",
  ],
};

export const NAV: NavItem[] = [
  // Yang dipakai tiap hari, urut mengikuti alur barang: bahan masuk,
  // dibeli, diolah, dijual.
  { href: "/items", label: "Materials & Stock", icon: Boxes, grup: "Operasional" },
  { href: "/purchase-orders", label: "Purchasing", icon: ClipboardList, grup: "Operasional" },
  { href: "/suppliers", label: "Suppliers", icon: Briefcase, grup: "Operasional" },
  { href: "/products", label: "Products", icon: Package, grup: "Operasional" },
  { href: "/clients", label: "Sales", icon: HandCoins, grup: "Operasional" },

  // Yang dibaca, bukan diisi.
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, grup: "Analisis" },
  { href: "/reports", label: "Reports", icon: BarChart3, grup: "Analisis" },
  { href: "/notifications", label: "Notifications", icon: Bell, grup: "Analisis" },

  // Yang jarang disentuh sesudah disiapkan.
  { href: "/settings", label: "Settings", icon: Settings, grup: "Administrasi" },
  { href: "/companies", label: "Companies", icon: Building2, grup: "Administrasi" },
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

/** Sub-menu tiap modul (hub), ditampilkan sebagai ikon di dropup HP. */
export const SUBMENUS: Record<string, SubItem[]> = {
  "/items": [
    { href: "/items", label: "Stock Items", icon: Boxes },
    { href: "/material-issues", label: "Material Issue", icon: PackageMinus },
    { href: "/stock-opname", label: "Stock Opname", icon: ClipboardCheck },
    { href: "/qc-incoming", label: "QC Incoming", icon: ShieldCheck, needs: ["qc"] },
    { href: "/materials", label: "Materials", icon: FlaskConical },
    { href: "/inci", label: "INCI Names", icon: BookText },
  ],
  "/purchase-orders": [
    { href: "/purchase-orders", label: "Purchase Order", icon: ClipboardList },
    { href: "/receivings", label: "Receiving", icon: PackageCheck },
    { href: "/purchase-returns", label: "Purchase Return", icon: Undo2 },
    { href: "/payments", label: "Payments", icon: Banknote },
    { href: "/ppic", label: "PPIC", icon: CalendarRange },
  ],
  "/products": [
    { href: "/products", label: "Products", icon: Package },
    { href: "/services", label: "Services", icon: Wrench },
    { href: "/production", label: "Production", icon: LayoutPanelLeft },
    { href: "/finished-goods", label: "Finished Goods", icon: PackageOpen },
    { href: "/qc-finished", label: "QC Finished", icon: ShieldCheck, needs: ["qa", "qc"] },
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
    { href: "/qc-parameters", label: "QC Parameters", icon: ClipboardCheck, needs: ["qc"] },
    { href: "/features", label: "Features", icon: Zap },
    { href: "/data-migration", label: "Data Migration", icon: DatabaseZap },
    { href: "/users", label: "Users", icon: Users },
    { href: "/activity-logs", label: "Activity Log", icon: ScrollText },
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
