import { apiHandler, jsonOk } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';

export async function GET() {
    return apiHandler(async () => {
        const user = await getCurrentUser();
        return jsonOk({
            authenticated: Boolean(user),
            profile: user,
            mode: isDemoMode ? 'demo' : 'production',
        });
    });
}
