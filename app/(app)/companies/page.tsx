import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import CompanyToggle from "./CompanyToggle";

type OrgRow = {
  id: string;
  nama: string;
  slug: string;
  aktif: boolean;
  profiles: { id: string; nama: string; email: string; role: string }[];
};

export default async function CompaniesPage() {
  const { isSuperAdmin } = await getEffectiveOrg();

  if (!isSuperAdmin) {
    return null; // AccessGuard sudah memblokir, ini pengaman ganda
  }

  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, nama, slug, aktif, profiles(id, nama, email, role)")
    .order("aktif", { ascending: true })
    .order("nama");

  const list = (orgs || []) as unknown as OrgRow[];
  const pending = list.filter((o) => !o.aktif).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Companies</h1>
      <p className="text-muted text-sm mt-1">
        {list.length} company terdaftar
        {pending > 0 ? ` — ${pending} menunggu aktivasi` : ""}
      </p>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Company</th>
              <th className="px-4 py-2.5 font-semibold">Admin</th>
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const adminUser = o.profiles.find((p) => p.role === "Admin");
              return (
                <tr
                  key={o.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.nama}</div>
                    <div className="text-[11.5px] text-muted font-mono">{o.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    {adminUser ? (
                      <>
                        <div>{adminUser.nama}</div>
                        <div className="text-[11.5px] text-muted">
                          {adminUser.email}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{o.profiles.length}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                        o.aktif
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-amber-100 text-amber-500"
                      }`}
                    >
                      {o.aktif ? "Aktif" : "Menunggu Aktivasi"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CompanyToggle id={o.id} nama={o.nama} aktif={o.aktif} />
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
