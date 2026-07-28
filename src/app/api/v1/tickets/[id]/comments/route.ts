import { z } from "zod";
import { apiHandler, jsonCreated, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { claimIdempotencyKey } from "@/lib/idempotency";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enqueueNotification } from "@/lib/notifications";

const schema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    const actor = await requireUser();
    const ticketId = z.uuid().parse((await context.params).id);
    const input = await parseJson(request, schema);
    if (isDemoMode) {
      return jsonCreated({
        id: crypto.randomUUID(),
        authorId: actor.id,
        ...input,
      });
    }
    await claimIdempotencyKey(request, actor.id, `ticket:${ticketId}:comment`);
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("ticket_comments")
      .insert({
        ticket_id: ticketId,
        author_id: actor.id,
        message: input.message,
      })
      .select()
      .single();
    if (error) throw error;
    const { data: ticket } = await admin
      .from("tickets")
      .select("display_id,title,reporter_id,assignee_id")
      .eq("id", ticketId)
      .single();
    if (ticket) {
      const recipients = [...new Set([ticket.reporter_id, ticket.assignee_id])]
        .filter((id): id is string => Boolean(id))
        .filter((id) => id !== actor.id);
      await Promise.allSettled(
        recipients.map((recipientId) =>
          enqueueNotification({
            recipientId,
            eventKey: `ticket:${ticketId}:comment:${data.id}`,
            title: `New comment · TKT-${ticket.display_id}`,
            message: `${actor.name}: ${input.message.slice(0, 180)}`,
            href: "/app?section=tickets",
          }),
        ),
      );
    }
    return jsonCreated(data);
  });
}
