/**
 * pigo REST client (edgeflare's PostgREST-like gateway).
 *
 * pigo differs from PostgREST in ways that matter (see edgeforce-ng
 * docs/hr-employee-select-and-pigo-rest-findings.md):
 *   - `like`/`ilike` require the caller to supply the `%` wildcard (`*` is NOT
 *     a wildcard).
 *   - There is NO cross-column `or=(...)` param. Repeated filters on the same
 *     column are OR'd; different columns are AND'd.
 *   - Reserved params: select, order, limit, offset.
 *
 * Every request carries the Dex bearer token. Mutations send
 * `Prefer: return=representation` so the affected rows come back.
 */
import { apiUrl, schema as defaultSchema } from '@/services/edgeflare/config';
import { getAccessToken } from '@/services/edgeflare/auth';

export class EdgeflareRestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message?: string,
  ) {
    super(message ?? `edgeflare REST ${status}: ${body}`);
    this.name = 'EdgeflareRestError';
  }
}

/** Filter/reserved params in pigo form, e.g. { id: 'eq.x', order: 'updated_at.asc' }. */
export type Filters = Record<string, string | number | undefined>;

function buildQuery(filters?: Filters): string {
  if (!filters) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function resourceUrl(resource: string, filters?: Filters, schema = defaultSchema): string {
  return `${apiUrl}/${schema}/${resource}${buildQuery(filters)}`;
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/**
 * fetch wrapper that logs every request (method + URL) and its resulting status.
 * Gives one line per REST call in the Metro console so the whole sync round-trip
 * is visible. Bodies are omitted to avoid dumping note content into the log.
 */
async function loggedFetch(method: string, url: string, init: RequestInit): Promise<Response> {
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    console.log(`[edgeflare] REST ${method} ${url} → ${res.status} (${Date.now() - started}ms)`);
    return res;
  } catch (error) {
    console.warn(`[edgeflare] REST ${method} ${url} → network error`, error);
    throw error;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    // Surface the server's actual reason (e.g. "permission denied for schema
    // notes ... pgrole: anon" when unauthenticated, or a NULL owner_uid / RLS
    // rejection when the token lacks a `uid` claim). Otherwise sync fails
    // silently and the UI can't explain why nothing reached the database.
    console.warn('[edgeflare] REST', res.status, res.url, text);
    throw new EdgeflareRestError(res.status, text);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** GET a list of rows. `filters` carries pigo params (eq./ilike./order/limit…). */
export async function list<T>(
  resource: string,
  filters?: Filters,
  schema?: string,
): Promise<T[]> {
  const res = await loggedFetch('GET', resourceUrl(resource, filters, schema), {
    method: 'GET',
    headers: await authHeaders(),
  });
  return (await parse<T[]>(res)) ?? [];
}

/** POST new row(s); returns the created representation. */
export async function create<T>(
  resource: string,
  body: unknown,
  schema?: string,
): Promise<T[]> {
  const res = await loggedFetch('POST', resourceUrl(resource, undefined, schema), {
    method: 'POST',
    headers: await authHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const out = await parse<T | T[]>(res);
  return Array.isArray(out) ? out : out ? [out] : [];
}

/** PATCH rows matching `filters`; returns the updated representation. */
export async function update<T>(
  resource: string,
  filters: Filters,
  body: unknown,
  schema?: string,
): Promise<T[]> {
  const res = await loggedFetch('PATCH', resourceUrl(resource, filters, schema), {
    method: 'PATCH',
    headers: await authHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const out = await parse<T | T[]>(res);
  return Array.isArray(out) ? out : out ? [out] : [];
}

/** DELETE rows matching `filters`. */
export async function remove(resource: string, filters: Filters, schema?: string): Promise<void> {
  const res = await loggedFetch('DELETE', resourceUrl(resource, filters, schema), {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await parse<unknown>(res);
}

/**
 * Insert-or-update a single row keyed by `id`. pigo upsert support varies, so
 * this does an explicit PATCH-then-POST: patch by id, and if nothing matched,
 * create. Two round-trips at most; fine for the low volume of a sync pass.
 */
export async function upsertById<T>(
  resource: string,
  id: string,
  body: Record<string, unknown>,
  schema?: string,
): Promise<T | null> {
  const patched = await update<T>(resource, { id: `eq.${id}` }, body, schema);
  if (patched.length > 0) return patched[0];
  const created = await create<T>(resource, body, schema);
  return created.length > 0 ? created[0] : null;
}
