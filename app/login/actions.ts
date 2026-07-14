"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type RegisterInput = {
  company: string;
  nama: string;
  email: string;
  password: string;
};

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerCompany(data: RegisterInput): Promise<RegisterResult> {
  try {
    return await doRegister(data);
  } catch (err) {
    // Kembalikan pesan asli supaya tetap terbaca di production (tidak dimask Next.js)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal mendaftar. Coba lagi.",
    };
  }
}

async function doRegister(data: RegisterInput): Promise<RegisterResult> {
  if (!data.company?.trim()) throw new Error("Nama perusahaan wajib diisi");
  if (!data.nama?.trim()) throw new Error("Nama lengkap wajib diisi");
  if (!data.email?.trim()) throw new Error("Email wajib diisi");
  if (!data.password || data.password.length < 6)
    throw new Error("Password minimal 6 karakter");

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Konfigurasi server belum lengkap: SUPABASE_SERVICE_ROLE_KEY tidak ditemukan. Cek Environment Variables di Vercel."
    );
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(
      "Konfigurasi server belum lengkap: NEXT_PUBLIC_SUPABASE_URL tidak ditemukan."
    );
  }

  const admin = createAdminClient();

  // 1. Buat organization dengan status NONAKTIF (menunggu aktivasi Super Admin)
  const slug =
    data.company
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) +
    "-" +
    Math.random().toString(36).slice(2, 6);

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ nama: data.company.trim(), slug, aktif: false })
    .select()
    .single();

  if (orgError) throw new Error(orgError.message);

  // 2. Buat user Admin untuk company tersebut
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: data.email.trim().toLowerCase(),
    password: data.password,
    email_confirm: true,
    user_metadata: {
      nama: data.nama.trim(),
      role: "Admin",
      organization_id: org.id,
    },
  });

  if (userError) {
    // Bersihkan org yang telanjur dibuat
    await admin.from("organizations").delete().eq("id", org.id);
    if (userError.message.toLowerCase().includes("already")) {
      throw new Error("Email ini sudah terdaftar. Silakan masuk atau pakai email lain.");
    }
    throw new Error(userError.message);
  }

  // 3. Pastikan profile konsisten
  await admin
    .from("profiles")
    .update({
      nama: data.nama.trim(),
      role: "Admin",
      aktif: true,
      organization_id: org.id,
      allowed_modules: null,
    })
    .eq("id", created.user.id);

  return { ok: true };
}
