import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono/cors';
import { handleApiRequest } from './handler.ts';
const appOrigin = Deno.env.get('SETU_APP_ORIGIN') || '';
const app = new Hono();
app.use(
    '*',
    cors({
        origin: appOrigin,
        allowHeaders: ['authorization', 'x-client-info', 'apikey', 'content-type'],
        allowMethods: ['POST', 'OPTIONS'],
    }),
);

app.post('*', handleApiRequest);

app.all('*', (context) => context.json({ error: 'Method not allowed.' }, 405));

Deno.serve(app.fetch);
