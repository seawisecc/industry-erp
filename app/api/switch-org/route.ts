import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { organizationId } = await request.json();
  const cookieStore = await cookies();

  cookieStore.set("selected_org_id", organizationId, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 hari
  });

  return NextResponse.json({ success: true });
}