import { AuthenticationError } from '@/lib/auth';

export function requireCronSecret(request: Request) {
    const expected = process.env.CRON_SECRET;
    const authorization = request.headers.get('authorization');
    if (!expected || authorization !== `Bearer ${expected}`) {
        throw new AuthenticationError('A valid cron secret is required.');
    }
}
