import { createClient } from "@supabase/supabase-js";

/**
 * Client dengan service role key — HANYA boleh dipakai di server ("use server" / server component).
 * Melewati RLS, dipakai untuk membuat/mengelola user auth via Admin API.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
