# Edge Note — edgeflare backend setup

The app is offline-first: it runs fully local with no backend. Cloud sync +
login/signup are powered by **edgeflare** (PostgreSQL + **pigo** REST + **Dex**
OIDC), replacing the previous Firebase stack.

## 1. Create the database schema

Apply [`notes_edgeflare.sql`](./notes_edgeflare.sql) to your edgeflare tenant's
Postgres (psql, tern, or the SQL console). It is idempotent — safe to re-run.

It creates the `notes` schema (`folders`, `notes`, `attachments`), a
`notes.current_uid()` helper, per-user **RLS**, an ownership trigger, and grants
for the `authn` role. Design mirrors the local SQLite schema
(`src/database/database.ts`) 1:1 (epoch-millis timestamps, booleans, JSON tags).

## 2. Expose the schema through pigo

pigo serves the tables at:

```
https://<tenant>.<region>.edgeflare.dev/api/notes/<table>
```

The `notes` schema must be in pigo's **exposed-schemas** list (the gateway
config, alongside `core`, `hr`, …). If you can't add a schema there, change every
`notes.` in the SQL to `core.` (already exposed) and set
`EXPO_PUBLIC_EDGEFLARE_SCHEMA=core` in the app.

## 3. Dex auth

Login/signup use Dex's OAuth2 **password grant** via `client_id=public-webui`,
with users getting the `authn` Postgres role (per the migration decision).

- Token:    `POST {host}/iam/token`  (`grant_type=password` | `refresh_token`)
- Register: `POST {host}/iam/register`

Ensure `public-webui` allows the password grant and that new sign-ups land a
`core.users` row with a `uid` claim in the issued JWT (RLS keys off it). If your
register endpoint's path/payload differs, adjust `signUp()` in
`src/services/edgeflare/auth.ts`.

## 4. Configure the app

Edit [`.env.local`](../.env.local) — set `EXPO_PUBLIC_EDGEFLARE_TENANT` (and
region if not `eu-west1`). Then restart Metro with a clear cache so the vars are
re-inlined:

```bash
npx expo start -c
```

Leave the tenant blank to keep the app fully local (no auth wall, no sync).

## App-side layer

`src/services/edgeflare/`:

| File | Role |
|------|------|
| `config.ts`   | env → host/apiUrl/iamUrl/schema/clientId/S3; `isEdgeflareConfigured` |
| `auth.ts`     | Dex password grant, refresh, JWT decode, `subscribeToAuth` |
| `rest.ts`     | pigo REST client (list/create/update/remove/upsert) |
| `notesApi.ts` | notes/folders/attachments ↔ REST (drop-in for the old Firestore module) |
| `storage.ts`  | attachment files over the S3 gateway |

The sync engine (`src/services/sync/syncEngine.ts`) is unchanged in logic — it
just imports the edgeflare adapters instead of Firebase.

## Not yet verified against a live tenant

- **S3 upload** path/verb in `storage.ts` is inferred from the Angular config,
  not confirmed. Attachment sync is independent of note sync, so a wrong guess
  here won't block core sync — adjust `uploadUrl()`/`publicUrl()` if uploads fail.
- **Dex `/iam/register`** payload shape — adjust `signUp()` if it differs.

The old `src/services/firebase/` files and the `firebase` dependency are now
unused and can be removed.
