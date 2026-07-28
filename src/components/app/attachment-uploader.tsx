"use client";

import { PaperClipOutlined } from "@ant-design/icons";
import { App, Button, Upload } from "antd";
import type { UploadProps } from "antd";
import { isDemoMode } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function AttachmentUploader({
  ownerType,
  ownerId,
}: {
  ownerType: "ticket" | "inventory_request";
  ownerId?: string;
}) {
  const { message } = App.useApp();

  const upload: UploadProps["customRequest"] = async ({
    file,
    onError,
    onSuccess,
  }) => {
    const selected = file as File;
    try {
      if (!allowedTypes.has(selected.type)) {
        throw new Error("Use JPEG, PNG, WebP or PDF files.");
      }
      if (selected.size > 15 * 1024 * 1024) {
        throw new Error("Attachments must be 15 MiB or smaller.");
      }
      if (isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        onSuccess?.({ demo: true });
        message.success(`${selected.name} attached in demo mode.`);
        return;
      }
      if (!ownerId) throw new Error("Save this record before adding files.");

      const response = await fetch("/api/v1/attachments/upload-url", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          ownerType,
          ownerId,
          fileName: selected.name,
          contentType: selected.type,
          sizeBytes: selected.size,
        }),
      });
      const body = (await response.json()) as {
        data?: { path: string; token: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Upload authorization failed.");
      }

      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.storage
        .from("private-attachments")
        .uploadToSignedUrl(body.data.path, body.data.token, selected, {
          contentType: selected.type,
        });
      if (error) throw error;
      onSuccess?.({ path: body.data.path });
      message.success(`${selected.name} uploaded privately.`);
    } catch (error) {
      const uploadError =
        error instanceof Error ? error : new Error("Upload failed.");
      onError?.(uploadError);
      message.error(uploadError.message);
    }
  };

  return (
    <Upload
      customRequest={upload}
      accept=".jpg,.jpeg,.png,.webp,.pdf"
      maxCount={5}
      multiple
    >
      <Button icon={<PaperClipOutlined />}>Add photos or files</Button>
    </Upload>
  );
}
