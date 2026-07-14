"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export async function setCompanyActive(id: string, aktif: boolean) {
  const { isSuperAdmin } = await getEffectiveOrg();
  if (!isSuperAdmin) throw new Error("Hanya Super Admin yang bisa mengelola company.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ aktif })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/companies");
  return { success: true };
}
