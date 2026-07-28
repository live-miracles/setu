import { apiHandler, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { demoState } from "@/demo/data";
import { isDemoMode } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  return apiHandler(async () => {
    const user = await requireUser();
    if (isDemoMode) return jsonOk(demoState.notifications);
    const { data, error } = await (await createServerSupabaseClient())
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return jsonOk(data);
  });
}
