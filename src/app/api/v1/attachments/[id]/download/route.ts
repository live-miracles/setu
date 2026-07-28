import { z } from "zod";
import { apiHandler, jsonOk, NotFoundError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    const user = await requireUser();
    const id = z.uuid().parse((await context.params).id);
    if (isDemoMode) return jsonOk({ signedUrl: null });
    const admin = createSupabaseAdminClient();
    const { data: attachment } = await admin
      .from("attachments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!attachment) throw new NotFoundError("Attachment not found.");

    if (user.role !== "admin" && attachment.uploaded_by !== user.id) {
      if (attachment.owner_type === "inventory_request") {
        const { data: request } = await admin
          .from("inventory_requests")
          .select("id")
          .eq("id", attachment.owner_id)
          .eq("requester_id", user.id)
          .maybeSingle();
        if (!request) throw new NotFoundError("Attachment not found.");
      } else if (!["ticket", "ticket_comment"].includes(attachment.owner_type)) {
        throw new NotFoundError("Attachment not found.");
      }
    }

    const { data, error } = await admin.storage
      .from("private-attachments")
      .createSignedUrl(attachment.storage_path, 300);
    if (error) throw error;
    return jsonOk({ signedUrl: data.signedUrl, expiresIn: 300 });
  });
}
