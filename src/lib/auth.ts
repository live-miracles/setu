import type { Profile } from '@/domain/types';
import { isDemoMode } from '@/lib/env';
import { demoState } from '@/demo/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export class AuthenticationError extends Error {
    status = 401;
}

export class AuthorizationError extends Error {
    status = 403;
}

export async function getCurrentProfile(): Promise<Profile | null> {
    if (isDemoMode) return demoState.currentUser;

    const supabase = await createServerSupabaseClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error } = await supabase
        .from('profiles')
        .select(
            'id,name,email,role,status,phone,whatsapp,timezone,notification_email,notification_push,departments(name)',
        )
        .eq('auth_user_id', user.id)
        .single();

    if (error || !profile || profile.status !== 'active') return null;
    const departmentValue = profile.departments as { name: string } | { name: string }[] | null;
    const department = Array.isArray(departmentValue)
        ? departmentValue[0]?.name
        : departmentValue?.name;

    return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        status: profile.status,
        phone: profile.phone ?? undefined,
        whatsapp: profile.whatsapp ?? undefined,
        timezone: profile.timezone,
        department: department ?? 'Unassigned',
        notificationPreferences: {
            email: profile.notification_email,
            push: profile.notification_push,
        },
    };
}

export async function requireUser() {
    const profile = await getCurrentProfile();
    if (!profile) throw new AuthenticationError('Sign in is required.');
    return profile;
}

export async function requireAdmin() {
    const profile = await requireUser();
    if (profile.role !== 'admin') {
        throw new AuthorizationError('Administrator access is required.');
    }
    return profile;
}
