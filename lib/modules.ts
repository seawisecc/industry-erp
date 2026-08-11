// Registry modul aplikasi, dipakai Sidebar, guard akses, dan checklist di form Pengguna.
// key = segmen pertama URL (mis. /purchase-orders/new → "purchase-orders")

export const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "items", label: "Stock Items" },
  { key: "material-issues", label: "Material Issue" },
  { key: "stock-opname", label: "Stock Opname" },
  { key: "materials", label: "Materials" },
  { key: "inci", label: "INCI Names" },
  { key: "qc-incoming", label: "QC Incoming" },
  { key: "qc-parameters", label: "QC Parameters" },
  { key: "purchase-orders", label: "Purchase Orders" },
  { key: "receivings", label: "Receiving" },
  { key: "purchase-returns", label: "Purchase Return" },
  { key: "payments", label: "Payments (Purchasing)" },
  { key: "ppic", label: "PPIC Planner" },
  { key: "suppliers", label: "Suppliers" },
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "production", label: "Production" },
  { key: "finished-goods", label: "Finished Goods" },
  { key: "qc-finished", label: "QC Finished Goods" },
  { key: "qa-release", label: "QA Release" },
  { key: "clients", label: "Clients" },
  { key: "consignments", label: "Consignment" },
  { key: "sales-invoices", label: "Sales Invoices" },
  { key: "pos", label: "POS" },
  { key: "sales-payments", label: "Sales Payments" },
  { key: "reports", label: "Reports" },
  { key: "data-migration", label: "Data Migration & Adjustment" },
  { key: "activity-logs", label: "Activity Log" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const MODULE_KEYS = MODULES.map((m) => m.key) as string[];

export type AccessProfile = {
  isSuperAdmin: boolean;
  role: string;
  allowedModules: string[] | null; // null = akses semua (Admin / akun lama)
};

export function canAccessModule(p: AccessProfile, moduleKey: string): boolean {
  // Menu Companies khusus Super Admin (aktivasi company baru)
  if (moduleKey === "companies") return p.isSuperAdmin;
  // Admin & Super Admin selalu akses semua, termasuk Pengguna & Pengaturan
  if (p.isSuperAdmin || p.role === "Admin") return true;
  // Menu Pengguna & Pengaturan khusus Admin. Log aktivitas ikut di sini:
  // isinya memuat perubahan hak akses dan seluruh dokumen keuangan.
  if (
    moduleKey === "users" ||
    moduleKey === "settings" ||
    moduleKey === "document-signing" ||
    moduleKey === "features" ||
    moduleKey === "qc-parameters" ||
    moduleKey === "activity-logs"
  )
    return false;
  // Rute di luar registry (mis. halaman lain) dibiarkan lewat
  if (!MODULE_KEYS.includes(moduleKey)) return true;
  // null = belum diset → akses semua modul bisnis (kompatibel akun lama)
  if (!p.allowedModules) return true;
  return p.allowedModules.includes(moduleKey);
}

/* ============================================================
   Halaman pendaratan setelah login.

   Dulu semua orang dilempar ke /dashboard, padahal dashboard adalah
   modul biasa yang bisa TIDAK diberikan ke seseorang. Akibatnya user
   seperti petugas QC selalu disambut layar "Tidak Punya Akses" tepat
   setelah memasukkan password, dan tombol satu-satunya di layar itu
   mengarah balik ke /dashboard: buntu.

   Sekarang pendaratannya dihitung dari hak aksesnya sendiri, memakai
   urutan MODULES di atas. Petugas QC mendarat di QC Incoming, kasir
   di POS.

   Akun yang belum diberi modul apa pun jatuh ke /notifications, dan
   itu bukan pilihan asal: notifications sengaja TIDAK terdaftar di
   MODULES, jadi canAccessModule selalu meloloskannya. Halaman itu
   satu-satunya yang dijamin bisa dibuka siapa pun yang berhasil
   login, sehingga tidak mungkin ada orang yang terkunci di luar.
   ============================================================ */

export const LANDING_TANPA_MODUL = "/notifications";

/** Modul pertama yang boleh dibuka user ini, atau notifications. */
export function landingPath(p: AccessProfile): string {
  for (const m of MODULES) {
    if (canAccessModule(p, m.key)) return `/${m.key}`;
  }
  return LANDING_TANPA_MODUL;
}

/** Nama halaman pendaratan, untuk teks tombol. */
export function landingLabel(p: AccessProfile): string {
  const path = landingPath(p);
  if (path === LANDING_TANPA_MODUL) return "Notifications";
  const key = path.slice(1);
  return MODULES.find((m) => m.key === key)?.label ?? "Beranda";
}

/** true = akun ini belum diberi modul apa pun. */
export function tanpaModul(p: AccessProfile): boolean {
  return landingPath(p) === LANDING_TANPA_MODUL;
}
