// Just enough of the Deno runtime for `npm run typecheck:functions` (tsc, no Deno
// install needed): the functions only read environment variables, and the one
// Hono type they import is the request context.
declare const Deno: { env: { get(name: string): string | undefined } };

declare module 'npm:hono@4' {
    export interface Context {
        req: { raw: Request };
    }
}
