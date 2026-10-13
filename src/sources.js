// The sources of an answer: how a source is written the same way before it is compared, how the sources an answer cites are
// read out of its text when the file does not list them, and whether a source is in the allowed set. A source is a web
// address or a document id such as doc:policy-motor-7. Nothing is opened or fetched; a source is only text.

import { LIMITS } from './data.js';

const URL_START = /^https?:\/\//i;
const URL_PARTS = /^(https?):\/\/([^/?#\s]*)([^#\s]*)/i;
const BARE_URL = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const DOC_ID = /\bdoc:[a-z0-9][a-z0-9._-]*/gi;
const MARKER = /\[(\d{1,6})\]/g;
const TRAILING = /[.,;:!?]+$/;

// A source written the same way every time: NFKC, white space collapsed, the scheme and the host of a web address in lower
// case, no fragment and no closing slash; a document id in lower case.
export function normalizeSource(source) {
  const t = source.normalize('NFKC').replace(/\s+/g, ' ').trim().replace(/^<|>$/g, '');
  const m = URL_START.test(t) ? URL_PARTS.exec(t) : null;
  if (m) {
    const rest = m[3].replace(/\/+$/, '');
    return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${rest}`;
  }
  return t.toLowerCase();
}

// The set of allowed sources: exact entries, and entries that end with * as prefixes.
export function allowedSet(allowed) {
  const exact = new Set();
  const prefixes = [];
  for (const entry of allowed) {
    const n = normalizeSource(entry);
    if (n.endsWith('*')) prefixes.push(n.slice(0, -1));
    else exact.add(n);
  }
  return { exact, prefixes };
}

export const isAllowed = (set, normalized) => set.exact.has(normalized) || set.prefixes.some((p) => normalized.startsWith(p));

// The sources an answer cites, read from its text: web addresses, document ids ("doc:" and a name) and markers such as [2]
// that stand for the second entry of sources. Returns { cited, unmapped, truncated }: cited is the list of distinct sources as
// written, unmapped the markers with no entry in sources, truncated true when the answer cites more than the limit.
export function extractCitations(answer, sources = []) {
  const cited = new Map();
  const unmapped = new Set();
  let truncated = false;
  const keep = (text) => {
    const n = normalizeSource(text);
    if (cited.has(n)) return true;
    if (cited.size >= LIMITS.maxCitations) {
      truncated = true;
      return false;
    }
    cited.set(n, text);
    return true;
  };
  for (const m of answer.matchAll(BARE_URL)) if (!keep(m[0].replace(TRAILING, ''))) break;
  if (!truncated) for (const m of answer.matchAll(DOC_ID)) if (!keep(m[0].replace(TRAILING, ''))) break;
  if (!truncated) {
    for (const m of answer.matchAll(MARKER)) {
      const n = Number(m[1]);
      const entry = n >= 1 ? sources[n - 1] : undefined;
      if (entry === undefined) unmapped.add(`[${m[1]}]`);
      else if (!keep(entry)) break;
    }
  }
  return { cited: [...cited.values()], unmapped: [...unmapped], truncated };
}
