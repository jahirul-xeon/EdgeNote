/**
 * Pragmatic HTML → Markdown-ish text, used to import `.html` files and Evernote
 * ENML note bodies. Block-level tags become newlines, headings/list-items get
 * Markdown prefixes, Evernote checkboxes become task items, then the result is
 * fed to `markdownToBlocks`. Not a real HTML parser — aims for readable text.
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    // &amp; last so we don't double-decode (e.g. `&amp;lt;` → `&lt;`, not `<`).
    .replace(/&amp;/gi, '&');
}

export function htmlToText(html: string): string {
  let s = html;

  // Drop non-content elements entirely.
  s = s.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');

  // Evernote task checkboxes.
  s = s.replace(/<en-todo[^>]*checked=["']?true["']?[^>]*\/?>/gi, '\n- [x] ');
  s = s.replace(/<en-todo[^>]*\/?>/gi, '\n- [ ] ');

  // Headings.
  s = s
    .replace(/<h1[^>]*>/gi, '\n# ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<h[4-6][^>]*>/gi, '\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n');

  // List items.
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');

  // Line and block breaks.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|tr|blockquote)>/gi, '\n');
  s = s.replace(/<(p|div|tr|blockquote)[^>]*>/gi, '\n');

  // Strip every remaining tag, then decode entities.
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);

  // Tidy whitespace.
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
