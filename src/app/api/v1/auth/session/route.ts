import { apiHandler, jsonOk } from "@/lib/api";
import { getCurrentProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export async function GET() {
  return apiHandler(async () => {
    const profile = await getCurrentProfile();
    return jsonOk({
      authenticated: Boolean(profile),
      profile,
      mode: isDemoMode ? "demo" : "production",
    });
  });
}
