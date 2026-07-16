// Registry modul aplikasi — dipakai Sidebar, guard akses, dan checklist di form Pengguna.
// key = segmen pertama URL (mis. /purchase-orders/new → "purchase-orders")

export const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "items", label: "Stok Bahan" },
  { key: "data-migration", label: "Migrasi Data & Adjustment" },
  { key: "purchase-orders", label: "Purchase Order" },
  { key: "receivings", label: "Receiving" },
  { key: "payments", label: "Pembayaran" },
  { key: "suppliers", label: "Supplier" },
  { key: "materials", label: "Material" },
  { key: "inci", label: "INCI Name" },
  { key: "products", label: "Produk" },
  { key: "production", label: "Produksi" },
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
  // Menu Pengguna & Pengaturan khusus Admin
  if (moduleKey === "users" || moduleKey === "settings") return false;
  // Rute di luar registry (mis. halaman lain) dibiarkan lewat
  if (!MODULE_KEYS.includes(moduleKey)) return true;
  // null = belum diset → akses semua modul bisnis (kompatibel akun lama)
  if (!p.allowedModules) return true;
  return p.allowedModules.includes(moduleKey);
}
