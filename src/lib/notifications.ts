import { Resend } from "resend";
import webpush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface NotificationInput {
  recipientId: string;
  eventKey: string;
  title: string;
  message: string;
  href: string;
}

export async function enqueueNotification(input: NotificationInput) {
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("notification_email,notification_push")
    .eq("id", input.recipientId)
    .single();
  if (profileError) throw profileError;

  const { data: notification, error } = await admin
    .from("notifications")
    .upsert(
      {
        recipient_id: input.recipientId,
        event_key: input.eventKey,
        title: input.title,
        message: input.message,
        href: input.href,
      },
      {
        onConflict: "recipient_id,event_key",
        ignoreDuplicates: true,
      },
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!notification) return;

  const deliveries = [
    ...(profile.notification_email
      ? [{ notification_id: notification.id, channel: "email" }]
      : []),
    ...(profile.notification_push
      ? [{ notification_id: notification.id, channel: "push" }]
      : []),
  ];
  if (deliveries.length) {
    const { error: deliveryError } = await admin
      .from("notification_deliveries")
      .upsert(deliveries, {
        onConflict: "notification_id,channel",
        ignoreDuplicates: true,
      });
    if (deliveryError) throw deliveryError;
  }
}

export async function dispatchPendingDeliveries(limit = 50) {
  const admin = createSupabaseAdminClient();
  const { data: deliveries, error } = await admin
    .from("notification_deliveries")
    .select(
      "id,channel,attempts,notification_id,notifications(title,message,href,recipient_id,profiles(email))",
    )
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries ?? []) {
    try {
      const notificationValue = delivery.notifications as unknown;
      const notification = (Array.isArray(notificationValue)
        ? notificationValue[0]
        : notificationValue) as {
        title: string;
        message: string;
        href: string;
        recipient_id: string;
        profiles: { email: string } | { email: string }[];
      } | null;
      if (!notification) throw new Error("Notification payload is missing.");

      if (delivery.channel === "email") {
        await sendEmail(notification);
      } else {
        await sendPush(notification);
      }

      await admin
        .from("notification_deliveries")
        .update({
          status: "sent",
          attempts: delivery.attempts + 1,
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", delivery.id);
      sent += 1;
    } catch (deliveryError) {
      const attempts = delivery.attempts + 1;
      const nextAttempt = new Date(
        Date.now() + Math.min(360, 2 ** attempts) * 60_000,
      ).toISOString();
      await admin
        .from("notification_deliveries")
        .update({
          status: "failed",
          attempts,
          next_attempt_at: nextAttempt,
          last_error:
            deliveryError instanceof Error
              ? deliveryError.message.slice(0, 1000)
              : "Unknown delivery error",
        })
        .eq("id", delivery.id);
      failed += 1;
    }
  }
  return { sent, failed };
}

async function sendEmail(notification: {
  title: string;
  message: string;
  href: string;
  profiles: { email: string } | { email: string }[];
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  const profile = Array.isArray(notification.profiles)
    ? notification.profiles[0]
    : notification.profiles;
  if (!profile?.email) throw new Error("Recipient email is missing.");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await resend.emails.send({
    from:
      process.env.RESEND_FROM_EMAIL ??
      "Livestream Operations <notifications@example.org>",
    to: profile.email,
    subject: notification.title,
    html: `<h2>${escapeHtml(notification.title)}</h2><p>${escapeHtml(notification.message)}</p><p><a href="${appUrl}${notification.href}">Open Livestream Operations</a></p>`,
  });
  if (error) throw new Error(error.message);
}

async function sendPush(notification: {
  title: string;
  message: string;
  href: string;
  recipient_id: string;
}) {
  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    throw new Error("VAPID keys are not configured.");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const admin = createSupabaseAdminClient();
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("profile_id", notification.recipient_id);
  if (error) throw error;

  const results = await Promise.allSettled(
    (subscriptions ?? []).map((subscription) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify({
          title: notification.title,
          body: notification.message,
          url: notification.href,
        }),
      ),
    ),
  );

  const successful = results.filter((result) => result.status === "fulfilled");
  if (!successful.length && subscriptions?.length) {
    throw new Error("All push subscriptions rejected the notification.");
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
