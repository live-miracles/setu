import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono/cors';
import { handleApiRequest } from './handler.ts';
const appOrigin = Deno.env.get('SETU_APP_ORIGIN') || '';
// Optional comma-separated extra browser origins (e.g. http://localhost:47193)
// so a local dev server can use this project. SETU_APP_ORIGIN stays the single
// public origin used in email links.
const extraOrigins = (Deno.env.get('SETU_EXTRA_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const app = new Hono();
app.use(
    '*',
    cors({
        origin: [appOrigin, ...extraOrigins],
        allowHeaders: ['authorization', 'x-client-info', 'apikey', 'content-type'],
        allowMethods: ['POST', 'OPTIONS'],
    }),
);

app.post('*', handleApiRequest);

app.all('*', (context) => context.json({ error: 'Method not allowed.' }, 405));

Deno.serve(app.fetch);
