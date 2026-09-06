/**
 * Link previews. Given a pasted URL we fetch the page HTML and scrape its
 * Open Graph / Twitter Card / <title> tags to build a preview card. It runs
 * fully client-side (no backend, works with the offline-first model — the
 * scraped metadata is stored on the block so the card renders offline too).
 */

export type LinkMetadata = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

const CACHE = new Map<string, LinkMetadata>();
const MAX_HTML = 300_000; // only the <head> matters; cap huge pages
const TIMEOUT_MS = 8000;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** True for a string that is exactly a single http(s) URL. */
export function isUrl(text: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(text.trim());
}

/**
 * Splits text into a leading part and a trailing URL, e.g. "see http://x" →
 * { lead: "see", url: "http://x" }. Returns null if it doesn't end with a URL.
 */
export function splitTrailingUrl(text: string): { lead: string; url: string } | null {
  const m = text.match(/^([\s\S]*?)(https?:\/\/[^\s]+)\s*$/i);
  if (!m) return null;
  return { lead: m[1].replace(/\s+$/, ''), url: m[2] };
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeEntities(m[1]);
  }
  return undefined;
}

/** Resolves a possibly-relative asset URL against the page URL. */
function resolveUrl(asset: string, pageUrl: string): string {
  if (/^https?:\/\//i.test(asset)) return asset;
  const origin = pageUrl.match(/^(https?:\/\/[^/]+)/i)?.[1] ?? '';
  if (asset.startsWith('//')) return `${origin.split('//')[0]}//${asset.slice(2)}`;
  if (asset.startsWith('/')) return `${origin}${asset}`;
  return `${origin}/${asset.replace(/^\.?\//, '')}`;
}

function metaTag(prop: 'property' | 'name', key: string): RegExp[] {
  const k = key.replace(/[:]/g, '\\:');
  return [
    new RegExp(`<meta[^>]+${prop}=["']${k}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${prop}=["']${k}["']`, 'i'),
  ];
}

/** Fetches and scrapes preview metadata for a URL (cached per session). */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  const cached = CACHE.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) return null; // e.g. a direct image/pdf link
    const html = (await res.text()).slice(0, MAX_HTML);

    const image = firstMatch(html, [
      ...metaTag('property', 'og:image:secure_url'),
      ...metaTag('property', 'og:image'),
      ...metaTag('name', 'twitter:image'),
      ...metaTag('name', 'twitter:image:src'),
    ]);

    const meta: LinkMetadata = {
      title: firstMatch(html, [
        ...metaTag('property', 'og:title'),
        ...metaTag('name', 'twitter:title'),
        [/<title[^>]*>([\s\S]*?)<\/title>/i][0],
      ]),
      description: firstMatch(html, [
        ...metaTag('property', 'og:description'),
        ...metaTag('name', 'twitter:description'),
        ...metaTag('name', 'description'),
      ]),
      image: image ? resolveUrl(image, url) : undefined,
      siteName: firstMatch(html, metaTag('property', 'og:site_name')),
    };

    // Nothing usable — let the caller fall back to a bare domain card.
    if (!meta.title && !meta.description && !meta.image) return null;
    CACHE.set(url, meta);
    return meta;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "https://www.example.com/path" → "example.com" for the card's footer. */
export function domainOf(url: string): string {
  return (
    url
      .match(/^https?:\/\/([^/]+)/i)?.[1]
      ?.replace(/^www\./, '') ?? url
  );
}
