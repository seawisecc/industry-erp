import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import CompanyToggle from "./CompanyToggle";
import MesToggle from "./MesToggle";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";
import { localDateStr } from "@/lib/dates";

type OrgRow = {
  id: string;
  nama: string;
  slug: string;
  aktif: boolean;
  aktif_sampai: string | null;
  profiles: { id: string; nama: string; email: string; role: string }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { isSuperAdmin } = await getEffectiveOrg();

  if (!isSuperAdmin) {
    return null; // AccessGuard sudah memblokir, ini pengaman ganda
  }

  const admin = createAdminClient();
  const sp = parseListQuery(await searchParams);
  const todayStr = localDateStr();

  // Nama/email admin ada di tabel profiles — cari org-nya lewat situ.
  let orgIdsByAdmin: string[] = [];
  if (sp.q) {
    const { data: ps } = await admin
      .from("profiles")
      .select("organization_id")
      .or(`nama.ilike."%${sp.q}%",email.ilike."%${sp.q}%"`)
      .limit(500);
    orgIdsByAdmin = [
      ...new Set(
        (ps || [])
          .map((p) => p.organization_id as string | null)
          .filter((v): v is string => !!v)
      ),
    ];
  }

  let query = admin
    .from("organizations")
    .select(
      "id, nama, slug, aktif, aktif_sampai, profiles(id, nama, email, role)",
      { count: "exact" }
    );

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["nama", "slug"], sp.q, "id", orgIdsByAdmin)
    );

  // Status di tabel adalah gabungan `aktif` + masa berlaku, bukan satu kolom
  const status = sp.filter("status");
  if (status === "Menunggu Aktivasi") query = query.eq("aktif", false);
  if (status === "Aktif")
    query = query
      .eq("aktif", true)
      .or(`aktif_sampai.is.null,aktif_sampai.gte.${todayStr}`);
  if (status === "Kedaluwarsa")
    query = query.eq("aktif", true).lt("aktif_sampai", todayStr);

  const { data: orgs, count } = await query
    .order("aktif", { ascending: true })
    .order("nama")
    .range(sp.from, sp.to);

  const list = (orgs || []) as unknown as OrgRow[];
  const info = pageInfo(sp.page, count, list.length);

  /** Belum diaktifkan / masa aktif lewat / aktif — dipakai untuk pil status. */
  const statusOrg = (o: OrgRow) => {
    if (!o.aktif)
      return { label: "Menunggu Aktivasi", cls: "bg-amber-100 text-amber-500" };
    if (o.aktif_sampai !== null && o.aktif_sampai < todayStr)
      return { label: "Kedaluwarsa", cls: "bg-clay-100 text-clay-600" };
    return { label: "Aktif", cls: "bg-botanical-100 text-botanical-700" };
  };

  // Fitur berbayar per company (MES dsb.)
  const { data: settingsRows } = await admin
    .from("organization_settings")
    .select("organization_id, features");
  const rows = (settingsRows || []) as {
    organization_id: string;
    features: Record<string, boolean> | null;
  }[];
  const mesOf = new Map<string, boolean>(
    rows.map((r) => [r.organization_id, r.features?.mes === true])
  );
  const qcOf = new Map<string, boolean>(
    rows.map((r) => [r.organization_id, r.features?.qc === true])
  );
  const qaOf = new Map<string, boolean>(
    rows.map((r) => [r.organization_id, r.features?.qa === true])
  );
  const pending = list.filter((o) => !o.aktif).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Companies</h1>
      <p className="text-muted text-sm mt-1">
        {info.total.toLocaleString("id-ID")} company terdaftar
        {pending > 0 ? `, ${pending} menunggu aktivasi` : ""}
      </p>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari nama company / admin..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                "Aktif",
                "Menunggu Aktivasi",
                "Kedaluwarsa",
              ].map((s) => ({ value: s, label: s })),
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(o) => o.id}
        minWidth={1080}
        empty="Belum ada company."
        columns={[
          {
            key: "company",
            header: "Company",
            role: "title",
            cell: (o) => (
              <>
                <div className="font-medium max-w-[220px] truncate" title={o.nama}>
                  {o.nama}
                </div>
                <div className="text-[11.5px] text-muted font-mono max-w-[220px] truncate">
                  {o.slug}
                </div>
              </>
            ),
            cardCell: (o) => (
              <>
                <div>{o.nama}</div>
                <div className="text-[11.5px] text-muted font-mono font-normal">
                  {o.slug}
                </div>
              </>
            ),
          },
          {
            key: "admin",
            header: "Admin",
            role: "primary",
            cell: (o) => {
              const admin = o.profiles.find((p) => p.role === "Admin");
              if (!admin) return "-";
              return (
                <>
                  <div className="whitespace-nowrap">{admin.nama}</div>
                  <div className="text-[11.5px] text-muted whitespace-nowrap">
                    {admin.email}
                  </div>
                </>
              );
            },
          },
          {
            key: "user",
            header: "User",
            role: "primary",
            cell: (o) => o.profiles.length,
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (o) => {
              const s = statusOrg(o);
              return (
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${s.cls}`}
                >
                  {s.label}
                </span>
              );
            },
          },
          {
            key: "valid",
            header: "Valid Sampai",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (o) =>
              !o.aktif ? (
                "-"
              ) : o.aktif_sampai ? (
                <span
                  className={
                    o.aktif_sampai < todayStr ? "text-clay-600 font-medium" : ""
                  }
                >
                  {formatTanggal(o.aktif_sampai)}
                </span>
              ) : (
                <span className="text-muted">Tanpa batas</span>
              ),
          },
          {
            key: "fitur",
            header: "Fitur Paket Full",
            role: "secondary",
            cell: (o) => (
              <div className="flex items-center gap-1.5">
                <MesToggle
                  organizationId={o.id}
                  initialOn={mesOf.get(o.id) || false}
                  featureKey="mes"
                />
                <MesToggle
                  organizationId={o.id}
                  initialOn={qcOf.get(o.id) || false}
                  featureKey="qc"
                />
                <MesToggle
                  organizationId={o.id}
                  initialOn={qaOf.get(o.id) || false}
                  featureKey="qa"
                />
              </div>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (o) => (
              <CompanyToggle
                id={o.id}
                nama={o.nama}
                aktif={o.aktif}
                aktifSampai={o.aktif_sampai}
              />
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </div>
  );
}
