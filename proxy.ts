import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16: konvensi "middleware.ts" berganti nama jadi "proxy.ts".
// Tugasnya sama: cek session di tiap request, lempar ke /login kalau belum auth.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() memverifikasi & ME-REFRESH token bila kedaluwarsa (cookie
  // diperbarui lewat setAll di atas). Sejak function pindah ke region
  // Singapore, panggilan ini hanya ~5-15ms, aman untuk tiap request.
  const { data: { user } } = await supabase.auth.getUser();

  // Halaman publik: bisa diakses tanpa login.
  // /verify ada di sini karena memang dipindai orang luar dari kertas,
  // isinya sengaja cuma identitas dokumen, tidak pernah isinya.
  const publicPaths = ["/login", "/kenapa", "/verify"];
  const isPublic = publicPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // manifest.webmanifest, sw.js, dan offline.html WAJIB ada di daftar
    // kecuali ini. Browser mengambil manifest tanpa cookie sama sekali, jadi
    // kalau proxy ikut menjaganya yang diterima cuma redirect ke /login dan
    // aplikasinya berhenti bisa dipasang lewat Chrome. Service worker
    // punya masalah yang sama, dan offline.html memang halaman publik.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
