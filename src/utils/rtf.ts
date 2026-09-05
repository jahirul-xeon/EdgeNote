/**
 * Minimal RTF → plain text converter, enough to import Apple Notes `.rtfd`
 * bundles (whose `TXT.rtf` is standard RTF). It strips control words and
 * destination groups (font/color tables, pictures, metadata), turns `\par` /
 * `\line` into newlines, and decodes `\uN` and `\'hh` character escapes.
 *
 * This is intentionally a pragmatic stripper, not a full RTF parser — it aims
 * for readable text, not byte-perfect fidelity.
 */

// Destination groups whose contents are not body text.
const IGNORED_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'datastore',
  'themedata',
  'colorschememapping',
  'listtable',
  'listoverridetable',
  'generator',
  'filetbl',
  'revtbl',
  'NeXTGraphic',
  'expandedcolortbl',
]);

export function rtfToText(rtf: string): string {
  let out = '';
  let i = 0;
  const n = rtf.length;
  const ignoreStack: boolean[] = [];
  let ignoring = false;

  const isAlpha = (ch: string) => ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z';
  const isDigit = (ch: string) => ch >= '0' && ch <= '9';

  while (i < n) {
    const c = rtf[i];

    if (c === '{') {
      ignoreStack.push(ignoring);
      // Look at the group's opening token to decide whether to ignore it.
      let k = i + 1;
      if (rtf[k] === '\\') {
        if (rtf[k + 1] === '*') {
          ignoring = true; // `{\*\...}` — an optional destination we don't render
        } else {
          let p = k + 1;
          while (p < n && isAlpha(rtf[p])) p++;
          if (IGNORED_DESTINATIONS.has(rtf.substring(k + 1, p))) ignoring = true;
        }
      }
      i++;
      continue;
    }

    if (c === '}') {
      ignoring = ignoreStack.pop() ?? false;
      i++;
      continue;
    }

    if (c === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        if (!ignoring) out += next;
        i += 2;
        continue;
      }
      if (next === "'") {
        const code = parseInt(rtf.substr(i + 2, 2), 16);
        if (!ignoring && !Number.isNaN(code)) out += String.fromCharCode(code);
        i += 4;
        continue;
      }
      // Control word: letters, optional signed number, optional single space.
      let j = i + 1;
      while (j < n && isAlpha(rtf[j])) j++;
      const word = rtf.substring(i + 1, j);
      let param = '';
      if (j < n && (rtf[j] === '-' || isDigit(rtf[j]))) {
        let k = rtf[j] === '-' ? j + 1 : j;
        while (k < n && isDigit(rtf[k])) k++;
        param = rtf.substring(j, k);
        j = k;
      }
      if (rtf[j] === ' ') j++;

      if (!ignoring) {
        if (word === 'par' || word === 'line' || word === 'sect' || word === 'pard') {
          if (word !== 'pard') out += '\n';
        } else if (word === 'tab') {
          out += '\t';
        } else if (word === 'u') {
          const code = parseInt(param, 10);
          if (!Number.isNaN(code)) out += String.fromCharCode(code < 0 ? code + 65536 : code);
          // Skip the ANSI fallback char that follows a \uN.
          if (j < n && rtf[j] !== '\\' && rtf[j] !== '{' && rtf[j] !== '}') j++;
        }
      }
      i = j;
      continue;
    }

    // Raw CR/LF in the RTF stream are not content.
    if (c === '\r' || c === '\n') {
      i++;
      continue;
    }

    if (!ignoring) out += c;
    i++;
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}
