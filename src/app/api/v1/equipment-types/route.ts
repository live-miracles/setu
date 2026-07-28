import { z } from "zod";
import { apiHandler, jsonCreated, jsonOk, parseJson } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  requestable: z.boolean().default(true),
});

export async function GET() {
  return apiHandler(async () => {
    await requireUser();
    if (isDemoMode) {
      return jsonOk([
        {
          id: "9aa20c17-2b0f-48f0-ad24-3170433005b3",
          name: "Camera",
          requestable: true,
        },
        {
          id: "a4bf343d-b118-4541-a9dc-9b09523403d5",
          name: "Audio",
          requestable: true,
        },
      ]);
    }
    const { data, error } = await (await createServerSupabaseClient())
      .from("equipment_types")
      .select("*")
      .order("name");
    if (error) throw error;
    return jsonOk(data);
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireAdmin();
    const input = await parseJson(request, schema);
    if (isDemoMode) return jsonCreated({ id: crypto.randomUUID(), ...input });
    const { data, error } = await createSupabaseAdminClient()
      .from("equipment_types")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return jsonCreated(data);
  });
}
