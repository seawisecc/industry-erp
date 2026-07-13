import { getEffectiveOrg } from "@/lib/getEffectiveOrg";

export default async function DashboardPage() {
  const { profile, isSuperAdmin } = await getEffectiveOrg();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="text-muted text-sm mt-1">Ringkasan stok &amp; produksi</p>

      <div className="mt-6 glass rounded-2xl p-5 max-w-md">
        <p className="text-sm">
          Halo, <b>{profile?.nama}</b> 👋
        </p>
        <p className="text-sm text-muted mt-1">Role: {profile?.role}</p>
        <p className="text-sm text-muted">
          Super Admin: {isSuperAdmin ? "Ya" : "Tidak"}
        </p>
      </div>
    </div>
  );
}