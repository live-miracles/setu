# Database backups

The Supabase Free plan has no managed backups. If your organization is on a paid
Supabase plan, use Supabase's own backups and skip this page.

For the Free plan, Setu does not ship a backup job in this repository. A workflow
artifact of a public repository can be downloaded by any GitHub user, and anyone
with read access to a private repository can download its artifacts, so a
database dump should not sit in the artifacts of the repository that holds the
application code. Instead, run the backup from a small separate **private**
repository that contains only the backup workflow. Everything else about Setu
(deployment, keep-alive, CI) stays in this repository.

[`backup-supabase.workflow.yml`](backup-supabase.workflow.yml) is a ready-to-use
template. It dumps the production data every Sunday (and on demand), encrypts it
with [age](https://github.com/FiloSottile/age), and uploads it as a workflow
artifact kept for 21 days, which is about 3 weekly backups. GitHub emails the
repository owner if a run fails.

## What is backed up

- Data only: the `public` and `auth` schemas, minus the session and token
  tables. The schema comes from `supabase/migrations/`.
- Storage images are not backed up.
- The dump is encrypted to a public key. The matching private key is never stored
  on GitHub, so without it the backups cannot be read.

## Set up the backup repository

1. Create a new **private** GitHub repository, for example `setu-backups`.
2. Add the template as `.github/workflows/backup-supabase.yml`.
3. Add a minimal `supabase/config.toml`. The CLI expects a `supabase/` directory
   but needs nothing else from it:

    ```toml
    project_id = "setu-backups"
    ```

4. Create the encryption key pair once, outside any repository. It prints the
   public key and writes the private key to `setu-backup-key.txt`. Keep that file
   in a password manager plus one offline copy. If it is lost, the backups cannot
   be restored.

    ```bash
    age-keygen -o setu-backup-key.txt
    ```

5. Add these repository secrets under **Settings → Secrets and variables →
   Actions**:
    - `BACKUP_AGE_PUBLIC_KEY`: the public key printed above, starting with `age1`
    - `SUPABASE_ACCESS_TOKEN`: a Supabase access token with access to the
      production project
    - `SUPABASE_PROJECT_REF_PROD`: the production project ref

    No database password is needed. When none is set, the Supabase CLI signs in
    to Postgres with a temporary role created through the access token.

6. Run **Actions → Back up Supabase → Run workflow** once to confirm it works.
   Backups are downloaded from the workflow run page.

Free GitHub plans include 2,000 Actions minutes a month and 500 MB of artifact
storage for private repositories (see
[GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions)).
A weekly run uses a few minutes, so check that the encrypted dump size times
three stays well under the storage limit.

## Restore into a fresh Supabase project

```bash
# 1. Create the schema.
npx supabase link --project-ref <new-project-ref>
npx supabase db push

# 2. Decrypt the downloaded artifact.
age --decrypt -i setu-backup-key.txt setu-prod-YYYY-MM-DD.sql.gz.age | gunzip > data.sql

# 3. Load it using the project's session pooler connection string
#    (Project Settings → Database). First delete rows the migrations seed,
#    because a duplicate key makes COPY skip that whole table:
psql "<connection-string>" \
  -c "truncate public.home_content, public.program_types cascade"
psql "<connection-string>" -v ON_ERROR_STOP=1 -f data.sql
```

After restoring, redeploy the Edge Function and point Supabase Auth and the
frontend at the new project (see [Deploy to Vercel](deployment.md#deploy-to-vercel)).
Restore a backup into a scratch project occasionally to confirm it works.
