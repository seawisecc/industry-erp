import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import UserForm from "../../UserForm";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: user } = await supabase
    .from("profiles")
    .select("id, email, nama, role, aktif, is_super_admin, allowed_modules, can_approve_po, can_plan_production")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!user) notFound();

  return (
    <div className="max-w-2xl">
      <Link
        href="/users"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Pengguna
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Edit Pengguna
      </h1>
      <p className="text-muted text-sm mb-6">{user.email}</p>

      <UserForm
        user={{
          id: user.id,
          email: user.email,
          nama: user.nama,
          role: user.role,
          aktif: user.aktif,
          allowed_modules: user.allowed_modules,
          is_super_admin: user.is_super_admin,
          can_approve_po: user.can_approve_po,
          can_plan_production: user.can_plan_production,
        }}
      />
    </div>
  );
}
