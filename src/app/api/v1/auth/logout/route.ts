import { apiHandler, jsonOk } from "@/lib/api";
import { isDemoMode } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  return apiHandler(async () => {
    if (isDemoMode) return jsonOk({ signedOut: true });
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return jsonOk({ signedOut: true });
  });
}
