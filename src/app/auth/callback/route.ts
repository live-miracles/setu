import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id,status,auth_user_id")
    .eq("email", data.user.email.toLowerCase())
    .maybeSingle();

  const isBootstrapAdmin =
    data.user.email.toLowerCase() ===
    process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();

  if (!profile && isBootstrapAdmin) {
    await admin.from("profiles").insert({
      auth_user_id: data.user.id,
      email: data.user.email.toLowerCase(),
      name:
        data.user.user_metadata.full_name ??
        data.user.email.split("@")[0],
      role: "admin",
      status: "active",
    });
    return NextResponse.redirect(`${origin}/app`);
  }

  if (!profile || profile.status === "disabled") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not-approved`);
  }

  if (profile.status === "invited") {
    await admin
      .from("profiles")
      .update({ auth_user_id: data.user.id, status: "active" })
      .eq("email", data.user.email.toLowerCase());
  } else if (!profile.auth_user_id) {
    await admin
      .from("profiles")
      .update({ auth_user_id: data.user.id })
      .eq("id", profile.id);
  } else if (profile.auth_user_id !== data.user.id) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not-approved`);
  }

  return NextResponse.redirect(`${origin}/app`);
}
