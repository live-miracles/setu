import type { User } from '@/domain/types';
import { isDemoMode } from '@/lib/env';
import { demoState } from '@/demo/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export class AuthenticationError extends Error {
    status = 401;
}

export class AuthorizationError extends Error {
    status = 403;
}

export async function getCurrentUser(): Promise<User | null> {
    if (isDemoMode) return demoState.currentUser;

    const supabase = await createServerSupabaseClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return null;

    // Table reads use the service-role client: RLS is enabled with no
    // policies (default-deny) everywhere, so the RLS-scoped client would
    // never see a row here.
    const admin = createSupabaseAdminClient();
    const { data: row, error } = await admin
        .from('users')
        .select('id,name,role,phone,whatsapp,timezone,departments(name)')
        .eq('id', user.email.toLowerCase())
        .single();

    if (error || !row) return null;
    const departmentValue = row.departments as { name: string } | { name: string }[] | null;
    const department = Array.isArray(departmentValue)
        ? departmentValue[0]?.name
        : departmentValue?.name;

    return {
        id: row.id,
        name: row.name,
        role: row.role,
        phone: row.phone ?? undefined,
        whatsapp: row.whatsapp ?? undefined,
        timezone: row.timezone,
        department: department ?? 'Unassigned',
    };
}

export async function requireUser() {
    const user = await getCurrentUser();
    if (!user) throw new AuthenticationError('Sign in is required.');
    return user;
}

export async function requireAdmin() {
    const user = await requireUser();
    if (user.role !== 'admin') {
        throw new AuthorizationError('Administrator access is required.');
    }
    return user;
}
