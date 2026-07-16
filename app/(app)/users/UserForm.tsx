"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser, updateUser } from "./actions";
import { MODULES } from "@/lib/modules";

type Props = {
  user?: {
    id: string;
    email: string;
    nama: string;
    role: string;
    role_title: string | null;
    aktif: boolean;
    allowed_modules: string[] | null;
    is_super_admin: boolean;
    can_approve_po: boolean;
    can_plan_production: boolean;
  };
};

const ROLE_SARAN = [
  "Owner",
  "Direktur",
  "Manager Produksi",
  "Supervisor QC",
  "Staff Gudang",
  "Staff Produksi",
  "Purchasing",
  "Finance",
  "Sales",
];

export default function UserForm({ user }: Props) {
  const router = useRouter();
  const isEdit = !!user;

  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [nama, setNama] = useState(user?.nama || "");
  const [roleTitle, setRoleTitle] = useState(user?.role_title || user?.role || "");
  const [isAdmin, setIsAdmin] = useState(user ? user.role === "Admin" : false);
  const [aktif, setAktif] = useState(user?.aktif ?? true);
  const [checked, setChecked] = useState<string[]>(
    user?.allowed_modules ?? MODULES.map((m) => m.key)
  );
  const [canApprovePO, setCanApprovePO] = useState(user?.can_approve_po ?? false);
  const [canPlanProduction, setCanPlanProduction] = useState(
    user?.can_plan_production ?? false
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allChecked = checked.length === MODULES.length;

  function toggle(key: string) {
    setChecked((cs) =>
      cs.includes(key) ? cs.filter((k) => k !== key) : [...cs, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const payload = {
        nama,
        role_title: roleTitle,
        is_admin: isAdmin,
        aktif,
        allowed_modules: isAdmin ? null : checked,
        can_approve_po: isAdmin ? true : canApprovePO,
        can_plan_production: isAdmin ? true : canPlanProduction,
      };
      if (isEdit && user) {
        await updateUser(user.id, {
          ...payload,
          new_password: password || undefined,
        });
      } else {
        await createUser({ ...payload, email, password });
      }
      router.push("/users");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengguna");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isEdit}
              placeholder="nama@perusahaan.com"
              className={`${inputCls} disabled:opacity-60`}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              {isEdit ? "Password Baru (kosongkan jika tidak diganti)" : "Password Awal"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
              minLength={6}
              placeholder="Minimal 6 karakter"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Nama
            </label>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
              placeholder="Nama lengkap"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Role / Jabatan
            </label>
            <input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              list="role-saran"
              placeholder="Bebas sesuai struktur company"
              className={inputCls}
            />
            <datalist id="role-saran">
              {ROLE_SARAN.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          {isEdit && (
            <div>
              <label className="block text-[12.5px] font-medium text-muted mb-1.5">
                Status
              </label>
              <select
                value={aktif ? "1" : "0"}
                onChange={(e) => setAktif(e.target.value === "1")}
                disabled={user?.is_super_admin}
                className={`${inputCls} disabled:opacity-60`}
              >
                <option value="1">Aktif</option>
                <option value="0">Nonaktif (tidak bisa login)</option>
              </select>
            </div>
          )}
        </div>

        <label
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] cursor-pointer border transition-all ${
            isAdmin
              ? "bg-botanical-100/70 border-botanical-700/40"
              : "glass-input border-transparent"
          }`}
        >
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            disabled={user?.is_super_admin}
            className="accent-[#2f4f3e]"
          />
          <span>
            <b>Admin perusahaan</b>
            <span className="block text-[11.5px] text-muted">
              Akses penuh ke semua modul, kelola pengguna &amp; pengaturan,
              serta otomatis bisa approve PO dan membuat plan produksi.
            </span>
          </span>
        </label>
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Akses Modul
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              {isAdmin
                ? "Admin perusahaan otomatis punya akses ke semua modul."
                : "Centang modul yang boleh dibuka user ini."}
            </p>
          </div>
          {!isAdmin && (
            <button
              type="button"
              onClick={() =>
                setChecked(allChecked ? [] : MODULES.map((m) => m.key))
              }
              className="text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
            >
              {allChecked ? "Hapus semua" : "Pilih semua"}
            </button>
          )}
        </div>

        {!isAdmin && (
          <label
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] cursor-pointer border transition-all ${
              canApprovePO
                ? "bg-amber-100/60 border-amber-500/40"
                : "glass-input border-transparent"
            }`}
          >
            <input
              type="checkbox"
              checked={canApprovePO}
              onChange={(e) => setCanApprovePO(e.target.checked)}
              className="accent-[#2f4f3e]"
            />
            <span>
              <b>Bisa menyetujui Purchase Order</b>
              <span className="block text-[11.5px] text-muted">
                Izin khusus — PO baru harus disetujui sebelum bisa dikirim ke
                supplier.
              </span>
            </span>
          </label>
        )}

        {!isAdmin && (
          <label
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] cursor-pointer border transition-all ${
              canPlanProduction
                ? "bg-amber-100/60 border-amber-500/40"
                : "glass-input border-transparent"
            }`}
          >
            <input
              type="checkbox"
              checked={canPlanProduction}
              onChange={(e) => setCanPlanProduction(e.target.checked)}
              className="accent-[#2f4f3e]"
            />
            <span>
              <b>Bisa membuat instruksi produksi (Plan)</b>
              <span className="block text-[11.5px] text-muted">
                Izin khusus — eksekusi produksi hanya bisa dimulai dari plan yang
                sudah dibuat.
              </span>
            </span>
          </label>
        )}

        {!isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {MODULES.map((m) => (
              <label
                key={m.key}
                className={`flex items-center gap-2.5 glass-input rounded-lg px-3 py-2.5 text-[13px] cursor-pointer transition-all ${
                  checked.includes(m.key) ? "ring-2 ring-botanical-700/60" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked.includes(m.key)}
                  onChange={() => toggle(m.key)}
                  className="accent-[#2f4f3e]"
                />
                {m.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Pengguna"}
      </button>
    </form>
  );
}
