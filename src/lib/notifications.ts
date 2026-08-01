import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

interface NotifyInput {
    /** The recipient's id, which is their email address. */
    userId: string;
    title: string;
    message: string;
    href?: string;
}

export async function notifyUser(input: NotifyInput) {
    try {
        await sendEmail(input);
    } catch (error) {
        const admin = createSupabaseAdminClient();
        await admin.from('failed_emails').insert({
            user_id: input.userId,
            title: input.title,
            message: input.message,
            error: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown email error',
        });
    }
}

async function sendEmail({ userId, title, message, href }: NotifyInput) {
    if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured.');
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const link = href ? `<p><a href="${appUrl}${href}">Open Setu</a></p>` : '';
    const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'Setu <notifications@example.org>',
        to: userId,
        subject: title,
        html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${link}`,
    });
    if (error) throw new Error(error.message);
}

function escapeHtml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
