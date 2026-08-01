import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const origin = requestUrl.origin;
    if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) {
        return NextResponse.redirect(`${origin}/login?error=oauth`);
    }

    const email = data.user.email.toLowerCase();
    const admin = createSupabaseAdminClient();
    const { data: user } = await admin.from('users').select('id').eq('id', email).maybeSingle();

    if (user) return NextResponse.redirect(`${origin}/app`);

    const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase();
    const emailDomain = email.split('@')[1];
    if (!allowedDomain || emailDomain !== allowedDomain) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=not-approved`);
    }

    const isBootstrapAdmin = email === process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
    await admin.from('users').insert({
        id: email,
        name: data.user.user_metadata.full_name ?? email.split('@')[0],
        role: isBootstrapAdmin ? 'admin' : 'member',
    });

    return NextResponse.redirect(`${origin}/app`);
}
