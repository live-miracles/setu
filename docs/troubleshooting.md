# Troubleshooting

Common problems when setting up or deploying Setu.

**Browser shows "Something went wrong / Failed to send a request to the Edge
Function"**: the `api` function isn't deployed to your linked project yet.
Run `npx supabase functions deploy api` (see
[Getting started](getting-started.md#3-apply-the-schema-and-deploy-the-api)).

**Browser shows "Something went wrong / Edge Function returned a non-2xx
status code"**: check the function logs in the Supabase dashboard
(**Edge Functions → api → Logs**). An error there reading `Cannot coerce the
result to a single JSON object` means a `.single()` query got zero rows —
almost always because the signed-in user has no matching `public.profiles`
row. This happens if you signed in before running `db push`, since the
profile-creation trigger only fires for auth users created _after_ the
trigger exists. Fix it by backfilling the missing row(s) for any existing
`auth.users` from the Supabase dashboard's SQL Editor:

```sql
insert into public.profiles (id, email, name)
select u.id, coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
```

This only inserts rows for users missing a profile, so it's safe to re-run.
New sign-ins after `db push` don't need this — the trigger handles them
automatically.

If every account has a profile and you still see this error only for an
`admin`/`approver` account: the `profiles` RLS policy lets admins/approvers
read every profile row, so an unfiltered `select('*').single()` query for
"my own profile" can return more than one row. The Edge Function code
filters explicitly by `.eq('id', userId)` before `.single()` for this
reason — if you're extending `supabase/functions/api/index.ts`, follow the
same pattern rather than relying on RLS alone to narrow a `.single()` query.

**Browser shows "Unsupported provider: provider is not enabled"**: the
Google provider isn't turned on yet, or Client ID/Secret aren't saved — see
[Configure Supabase Auth](getting-started.md#2-configure-supabase-auth).

**Signing in on a Vercel deployment redirects to `localhost` instead of the
app**: that project's Supabase Auth **Site URL** is still pointing at the
local dev default. See
[Deploy to Vercel](deployment.md#2-point-supabase-auth-at-the-vercel-domain).

**Local requests fail with a CORS error**: the API only accepts the origins in
`SETU_APP_ORIGIN` and `SETU_EXTRA_ORIGINS`. Add your local origin (for example
`http://localhost:47193`) to `SETU_EXTRA_ORIGINS`.

**Comment emails stay pending**: the `email-dispatcher` function does nothing
until all its secrets are set. Follow
[Comment email delivery](deployment.md#comment-email-delivery).
