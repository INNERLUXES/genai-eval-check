// The matching of phrases in an answer. It is plain string work and nothing else: Unicode NFKC, lower case, typographic quotes
// written as plain ones, runs of white space as one space, and optionally the punctuation taken out; then a phrase is looked
// for as a run of characters that does not start or end inside a word. There is no fuzzy matching, no stemming, no synonyms
// and no meaning (docs/decisions/0001).

import { InputError } from './files.js';

const SINGLE = /[\u2018\u2019\u201a\u201b\u2032\u02bc]/g;
const DOUBLE = /[\u201c\u201d\u201e\u201f\u2033]/g;
const PUNCTUATION = /\p{P}+/gu;
const WORD = /^[\p{L}\p{N}\p{M}_]$/u;
const DIGIT = /^\p{Nd}$/u;

// The text as it is compared: NFKC, lower case (String.prototype.toLowerCase, which does not depend on the locale), plain
// quotes, no punctuation when asked, and runs of white space as one space.
export function normalizeText(text, { stripPunctuation = false } = {}) {
  let t = text.normalize('NFKC').toLowerCase().replace(SINGLE, "'").replace(DOUBLE, '"');
  if (stripPunctuation) t = t.replace(PUNCTUATION, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// The budget of the work of one run: every search of a phrase costs the length of the text it looks in. A run that would
// spend more than the limit stops with an error, so a hostile file cannot make the run take very long.
export function createWork(limit) {
  return { left: limit, limit };
}

export function spend(work, amount) {
  work.left -= amount;
  if (work.left < 0) throw new InputError([`the work limit of ${work.limit.toLocaleString('en-US')} characters searched is reached; the file holds too much text for its number of phrases, so nothing was checked. Check it in smaller files`]);
}

// The code point that ends before an index of a text, or '' at the start.
function before(text, i) {
  if (i <= 0) return '';
  const low = text.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) {
    const high = text.charCodeAt(i - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(i - 2, i);
  }
  return text[i - 1];
}

// The code point that starts at an index of a text, or '' at the end.
function after(text, i) {
  if (i >= text.length) return '';
  return String.fromCodePoint(text.codePointAt(i));
}

const isWord = (c) => c !== '' && WORD.test(c);
const isDigit = (c) => c !== '' && DIGIT.test(c);
const isJoiner = (c) => c === '.' || c === ',';

// Whether the phrase found at an index sits on word edges. A phrase that starts with a letter or a digit must not follow a
// letter, a digit or an underscore, and one that ends with one must not be followed by one; a number does not start or end
// inside a longer number written with a point or a comma ("250" is not in "2,500" or "250.50").
function edgesOk(text, at, phrase) {
  const first = after(phrase, 0);
  if (isWord(first)) {
    const prev = before(text, at);
    if (isWord(prev)) return false;
    if (isDigit(first) && isJoiner(prev) && isDigit(before(text, at - 1))) return false;
  }
  const end = at + phrase.length;
  const last = before(phrase, phrase.length);
  if (isWord(last)) {
    const next = after(text, end);
    if (isWord(next)) return false;
    if (isDigit(last) && isJoiner(next) && isDigit(after(text, end + 1))) return false;
  }
  return true;
}

// The index of the first place at or after from where the normalized phrase is in the normalized text, or -1.
export function findPhrase(text, phrase, from = 0, work = null) {
  if (phrase === '') return -1;
  if (work) spend(work, text.length);
  let at = from;
  for (;;) {
    at = text.indexOf(phrase, at);
    if (at < 0) return -1;
    if (edgesOk(text, at, phrase)) return at;
    at += 1;
  }
}

// How many places the phrase is in the text, counted from left to right with no overlap; at most max are counted.
export function countPhrase(text, phrase, max = 1000000, work = null) {
  if (phrase === '') return 0;
  if (work) spend(work, text.length);
  let count = 0;
  let at = 0;
  while (count < max) {
    at = text.indexOf(phrase, at);
    if (at < 0) break;
    if (edgesOk(text, at, phrase)) {
      count += 1;
      at += phrase.length;
    } else at += 1;
  }
  return count;
}
