import { apiHandler, jsonCreated, jsonOk, parseJson } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { demoState } from "@/demo/data";
import { isDemoMode } from "@/lib/env";
import { claimIdempotencyKey } from "@/lib/idempotency";
import { enqueueNotification } from "@/lib/notifications";
import { createShiftSchema, paginationSchema } from "@/lib/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireUser();
    if (isDemoMode) return jsonOk(demoState.shifts);
    const url = new URL(request.url);
    const page = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const supabase = await createServerSupabaseClient();
    const from = (page.page - 1) * page.pageSize;
    const { data, count, error } = await supabase
      .from("roster_shifts")
      .select(
        "*,roster_assignments(profile_id,profiles(id,name,avatar_path)),locations(name)",
        { count: "exact" },
      )
      .order("starts_at", { ascending: false })
      .range(from, from + page.pageSize - 1);
    if (error) throw error;
    return jsonOk({ items: data, total: count ?? 0, ...page });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    const actor = await requireAdmin();
    const input = await parseJson(request, createShiftSchema);
    if (isDemoMode) {
      return jsonCreated({ id: crypto.randomUUID(), ...input });
    }
    await claimIdempotencyKey(request, actor.id, "roster:create");
    const admin = createSupabaseAdminClient();
    const { data: shift, error } = await admin
      .from("roster_shifts")
      .insert({
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        period: input.period,
        location_id: input.locationId,
        location_name: input.locationName,
        notes: input.notes,
        created_by: actor.id,
      })
      .select()
      .single();
    if (error) throw error;

    const { error: assignmentError } = await admin
      .from("roster_assignments")
      .insert(
        input.assigneeIds.map((profileId) => ({
          shift_id: shift.id,
          profile_id: profileId,
        })),
      );
    if (assignmentError) {
      await admin.from("roster_shifts").delete().eq("id", shift.id);
      throw assignmentError;
    }

    await admin.from("audit_events").insert({
      actor_id: actor.id,
      entity_type: "roster_shift",
      entity_id: shift.id,
      action: "create",
      after_state: shift,
    });
    await Promise.all(
      input.assigneeIds.map((recipientId) =>
        enqueueNotification({
          recipientId,
          eventKey: `roster:${shift.id}:assigned`,
          title: "New roster assignment",
          message: `${input.period} shift at ${input.locationName}`,
          href: "/app?section=roster",
        }),
      ),
    );
    return jsonCreated(shift);
  });
}
