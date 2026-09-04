/**
 * edgeflare configuration.
 *
 * Config comes from EXPO_PUBLIC_* env vars (inlined at build time — restart
 * Metro with `-c` after editing `.env.local`). The app is offline-first and
 * must run with NO backend configured: when the tenant/host is absent,
 * `isEdgeflareConfigured` is false and the auth/sync layers stay dormant, so
 * the local app works exactly as before.
 *
 * Backend contract (see edgeforce-ng: environment.ts, api.service.ts,
 * auth.service.ts, docs/auth-strategy.md):
 *   REST : {host}/api/{schema}/{resource}     (pigo — PostgREST-like)
 *   IAM  : {host}/iam/token, {host}/iam/register   (Dex, OAuth2 password grant)
 *   S3   : PUT {host}/s3/v1/...   read {s3Endpoint}/{tenant}:{bucket}/{key}
 */

const tenant = process.env.EXPO_PUBLIC_EDGEFLARE_TENANT ?? '';
const region = process.env.EXPO_PUBLIC_EDGEFLARE_REGION ?? 'eu-west1';

/** Full origin, e.g. https://<tenant>.eu-west1.edgeflare.dev. Overridable. */
export const host =
  process.env.EXPO_PUBLIC_EDGEFLARE_HOST ||
  (tenant ? `https://${tenant}.${region}.edgeflare.dev` : '');

/** Postgres schema pigo exposes the notes tables under. */
export const schema = process.env.EXPO_PUBLIC_EDGEFLARE_SCHEMA ?? 'notes';

/** Dex OAuth2 client id (reusing the ERP back-office client per project decision). */
export const clientId = process.env.EXPO_PUBLIC_EDGEFLARE_CLIENT_ID ?? 'public-webui';

/** OAuth2 scope — mirrors edgeforce-ng's environment.oidc.scope. */
export const scope =
  process.env.EXPO_PUBLIC_EDGEFLARE_SCOPE ??
  'openid profile email groups offline_access audience:server:client_id:oauth2-proxy';

export const apiUrl = host ? `${host}/api` : '';
export const iamUrl = host ? `${host}/iam` : '';

// ── S3 (attachments) ────────────────────────────────────────────────
export const s3ApiUrl = host ? `${host}/s3/v1` : '';
export const s3Endpoint =
  process.env.EXPO_PUBLIC_EDGEFLARE_S3_ENDPOINT ?? 'https://s3.eu-west1.edgeflare.dev';
export const s3Bucket = process.env.EXPO_PUBLIC_EDGEFLARE_S3_BUCKET ?? 'notes';
export const s3Tenant = tenant;

/** True once a tenant/host is configured; gates the whole cloud layer. */
export const isEdgeflareConfigured = Boolean(host);
