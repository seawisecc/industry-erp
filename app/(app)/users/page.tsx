import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import { MODULES } from "@/lib/modules";

type UserRow = {
  id: string;
  email: string;
  nama: string;
  role: string;
  aktif: boolean;
  is_super_admin: boolean;
  allowed_modules: string[] | null;
};

export default async function UsersPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, nama, role, aktif, is_super_admin, allowed_modules")
    .eq("organization_id", organizationId)
    .order("nama");

  const list = (users || []) as UserRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Pengguna</h1>
          <p className="text-muted text-sm mt-1">
            {list.length} pengguna — atur akses modul per user
          </p>
        </div>
        <Link
          href="/users/new"
          className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
        >
          <Plus size={16} /> Tambah Pengguna
        </Link>
      </div>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Nama</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">Akses Modul</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const isFullAccess =
                u.is_super_admin || u.role === "Admin" || !u.allowed_modules;
              return (
                <tr
                  key={u.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {u.nama}
                      {u.is_super_admin && (
                        <span className="ml-2 text-[10.5px] bg-botanical-100 text-botanical-700 px-1.5 py-0.5 rounded-full">
                          Super Admin
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-muted">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    {isFullAccess ? (
                      <span className="text-[12.5px]">Semua modul</span>
                    ) : (
                      <span className="text-[12.5px] text-muted">
                        {u.allowed_modules!.length} dari {MODULES.length} modul
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                        u.aktif
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-clay-100 text-clay-600"
                      }`}
                    >
                      {u.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/users/${u.id}/edit`}
                      className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
