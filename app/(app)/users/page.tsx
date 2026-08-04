import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { MODULES } from "@/lib/modules";
import SettingsShell from "@/components/SettingsShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import {
  ilikeOr,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

type UserRow = {
  id: string;
  email: string;
  nama: string;
  role: string;
  role_title: string | null;
  aktif: boolean;
  is_super_admin: boolean;
  allowed_modules: string[] | null;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("profiles")
    .select(
      "id, email, nama, role, role_title, aktif, is_super_admin, allowed_modules",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(ilikeOr(["nama", "email", "role", "role_title"], sp.q));
  if (sp.filter("status"))
    query = query.eq("aktif", sp.filter("status") === "Aktif");

  const { data: users, count } = await query
    .order("nama")
    .range(sp.from, sp.to);

  const list = (users || []) as UserRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <SettingsShell>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Users</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} pengguna, atur akses modul per
            user
          </p>
        </div>
        <Link
          href="/users/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={16} /> Tambah Pengguna
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari nama / email / role..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                { value: "Aktif", label: "Aktif" },
                { value: "Nonaktif", label: "Nonaktif" },
              ],
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(u) => u.id}
        minWidth={720}
        empty="Belum ada user."
        columns={[
          {
            key: "nama",
            header: "Nama",
            role: "title",
            cell: (u) => (
              <>
                <div className="font-medium">
                  {u.nama}
                  {u.is_super_admin && (
                    <span className="ml-2 text-[10.5px] bg-botanical-100 text-botanical-700 px-1.5 py-0.5 rounded-full">
                      Super Admin
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-muted">{u.email}</div>
              </>
            ),
            cardCell: (u) => (
              <>
                <div>
                  {u.nama}
                  {u.is_super_admin && (
                    <span className="ml-2 text-[10.5px] bg-botanical-100 text-botanical-700 px-1.5 py-0.5 rounded-full font-medium">
                      Super Admin
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-muted font-normal">{u.email}</div>
              </>
            ),
          },
          {
            key: "role",
            header: "Role",
            role: "primary",
            cell: (u) => (
              <>
                <span className="whitespace-nowrap">{u.role_title || u.role}</span>
                {u.role === "Admin" && (
                  <span className="ml-1.5 text-[10.5px] bg-botanical-100 text-botanical-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    Admin
                  </span>
                )}
              </>
            ),
          },
          {
            key: "modul",
            header: "Akses Modul",
            role: "primary",
            cell: (u) =>
              u.is_super_admin || u.role === "Admin" || !u.allowed_modules ? (
                <span className="text-[12.5px]">Semua modul</span>
              ) : (
                <span className="text-[12.5px] text-muted">
                  {u.allowed_modules.length} dari {MODULES.length} modul
                </span>
              ),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (u) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                  u.aktif
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {u.aktif ? "Aktif" : "Nonaktif"}
              </span>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (u) => (
              <RowActions>
                <IconAction
                  icon={Pencil}
                  label="Edit user"
                  href={`/users/${u.id}/edit`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </SettingsShell>
  );
}
