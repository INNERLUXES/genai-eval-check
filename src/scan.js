// What an answer must not carry: strings that look like secrets (keys, seeds, tokens) and strings that look like personal
// data (email addresses, phone numbers, card numbers). Both searches report the kind and the position only; the value is never
// put in a message. The search for keys and seeds is the one of the sibling tools (src/secrets.js) for the single-word shapes,
// with more shapes of tokens and a search for a run of words that looks like a seed phrase. Every search is a loop or a
// pattern without nested repeats, so a long answer takes linear time.

import { LIMITS } from './data.js';
import { secretShape } from './secrets.js';

const TOKEN = /\S+/g;
const EDGE_START = /^[("'<[{]+/;
const EDGE_END = /[)"'>\]},.;:!?]+$/;
const SENTENCE_END = /[.,;:!?]$/;
const LOWER_WORD = /^[a-z]{3,8}$/;

// Short English words that are in no seed phrase list the tool knows of; a run that holds one is prose and not a seed.
const COMMON = new Set(['the', 'and', 'you', 'your', 'are', 'for', 'with', 'that', 'this', 'can', 'our', 'from', 'have', 'has', 'not', 'was', 'were', 'been', 'they', 'their', 'which', 'would', 'there', 'but', 'when', 'what', 'who', 'how', 'why', 'than', 'then', 'them', 'these', 'those', 'also', 'into', 'its', 'may', 'must', 'should', 'could', 'does', 'did', 'out', 'over', 'under']);

// Shapes found in one word of the answer, once the marks at its edges are taken away.
const WORD_SHAPES = [
  ['an access key id', /^(?:AKIA|ASIA)[0-9A-Z]{16}$/],
  ['a Slack-style token', /^xox[abprs]-[A-Za-z0-9-]{10,}$/],
  ['a signed web token', /^eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/],
  ['a secret key with the prefix sk-', /^sk-[A-Za-z0-9_-]{20,}$/],
  ['a code-host token', /^gh[pousr]_[A-Za-z0-9]{30,}$/]
];

const ASSIGNMENT = /\b(?:api[_-]?key|access[_-]?key|secret|token|passwd|password|pwd)\b["']?[ \t]{0,3}[:=][ \t]{0,3}["']?([A-Za-z0-9/+_.=-]{12,})/gi;
const BEARER = /\bbearer[ \t]+([A-Za-z0-9._~+/=-]{20,})/gi;
const PRIVATE_BLOCK = 'PRIVATE KEY-----';

const mixed = (value) => /[0-9]/.test(value) && /[A-Za-z]/.test(value);

// The places in an answer that look like a secret: a list of { kind, position } with the 1-based position of the first
// character, at most LIMITS.maxMarks of them, in the order of the positions. Nothing of the value is kept.
export function findSecretLike(answer) {
  const marks = [];
  const add = (kind, position) => {
    if (!marks.some((m) => m.kind === kind && m.position === position)) marks.push({ kind, position });
  };
  let run = [];
  let seen = new Set();
  let runStart = 0;
  const close = () => {
    if (run.length >= 12) add('a seed phrase', runStart + 1);
    run = [];
    seen = new Set();
  };
  for (const m of answer.matchAll(TOKEN)) {
    const raw = m[0];
    const trimmed = raw.replace(EDGE_START, '');
    const clean = trimmed.replace(EDGE_END, '');
    const where = m.index + (raw.length - trimmed.length);
    if (clean.length >= 20 && clean.length <= 4000) {
      const shape = secretShape(clean);
      if (shape) add(shape, where + 1);
      else for (const [kind, pattern] of WORD_SHAPES) if (pattern.test(clean)) add(kind, where + 1);
    }
    if (LOWER_WORD.test(clean) && !COMMON.has(clean) && !seen.has(clean)) {
      if (run.length === 0) runStart = where;
      run.push(clean);
      seen.add(clean);
      if (SENTENCE_END.test(raw)) close();
    } else {
      close();
      if (LOWER_WORD.test(clean) && !COMMON.has(clean)) {
        runStart = where;
        run.push(clean);
        seen.add(clean);
      }
    }
    if (marks.length >= LIMITS.maxMarks) return marks.sort((a, b) => a.position - b.position);
  }
  close();
  for (const m of answer.matchAll(ASSIGNMENT)) if (mixed(m[1])) add('a key or password written as an assignment', m.index + 1);
  for (const m of answer.matchAll(BEARER)) if (mixed(m[1])) add('a bearer token', m.index + 1);
  let at = answer.indexOf(PRIVATE_BLOCK);
  while (at >= 0 && marks.length < LIMITS.maxMarks) {
    if (answer.slice(Math.max(0, at - 40), at).includes('-----BEGIN ')) add('a private key block', Math.max(0, answer.lastIndexOf('-----BEGIN ', at)) + 1);
    at = answer.indexOf(PRIVATE_BLOCK, at + 1);
  }
  return marks.sort((a, b) => a.position - b.position).slice(0, LIMITS.maxMarks);
}

// Whether the digits (a text of digits) pass the Luhn check.
export function luhn(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

const isDigitCode = (c) => c >= 48 && c <= 57;
const isWordCode = (c) => isDigitCode(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const SEPARATORS = new Set([32, 45, 46, 40, 41, 43]);
const CARD_SHAPE = /^[0-9]+(?:[ -][0-9]+)*$/;
const DOTTED_QUAD = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// Email addresses: a local part, an at sign and a domain with a dot and a final label of letters.
function findEmails(answer, marks) {
  let at = answer.indexOf('@');
  while (at >= 0 && marks.length < LIMITS.maxMarks) {
    let start = at;
    while (start > 0 && at - start < 64 && /[A-Za-z0-9._%+-]/.test(answer[start - 1])) start -= 1;
    let end = at + 1;
    while (end < answer.length && end - at < 255 && /[A-Za-z0-9.-]/.test(answer[end])) end += 1;
    const domain = answer.slice(at + 1, end).replace(/[.-]+$/, '');
    if (start < at && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(domain)) marks.push({ kind: 'an email address', position: start + 1, domain: domain.toLowerCase() });
    at = answer.indexOf('@', at + 1);
  }
}

// Runs of digits, spaces, hyphens, points, brackets and plus signs: a card number when the digits pass the Luhn check, a
// phone number when there are 9 to 15 digits and a separator or a leading plus.
function findNumbers(answer, marks) {
  const n = answer.length;
  let i = 0;
  while (i < n && marks.length < LIMITS.maxMarks) {
    const c = answer.charCodeAt(i);
    const starts = isDigitCode(c) || ((c === 43 || c === 40) && i + 1 < n && (isDigitCode(answer.charCodeAt(i + 1)) || answer.charCodeAt(i + 1) === 40));
    if (!starts || (i > 0 && isWordCode(answer.charCodeAt(i - 1)))) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && (isDigitCode(answer.charCodeAt(j)) || SEPARATORS.has(answer.charCodeAt(j)))) j += 1;
    let end = j;
    while (end > i && !isDigitCode(answer.charCodeAt(end - 1)) && answer.charCodeAt(end - 1) !== 41) end -= 1;
    const length = end - i;
    const next = end < n ? answer.charCodeAt(end) : 0;
    if (length <= 40 && !isWordCode(next)) {
      const text = answer.slice(i, end);
      const digits = text.replace(/\D/g, '');
      if (CARD_SHAPE.test(text) && digits.length >= 13 && digits.length <= 19 && luhn(digits)) marks.push({ kind: 'a card number', position: i + 1 });
      else if (digits.length >= 9 && digits.length <= 15 && !DOTTED_QUAD.test(text) && (text.startsWith('+') || /[ ()-]/.test(text))) marks.push({ kind: 'a phone number', position: i + 1 });
    }
    i = Math.max(j, i + 1);
  }
}

// The places in an answer that look like personal data: a list of { kind, position } (an email address also has its domain,
// in lower case, for the allow list). The value is not kept.
export function findPiiLike(answer) {
  const marks = [];
  findEmails(answer, marks);
  findNumbers(answer, marks);
  return marks.sort((a, b) => a.position - b.position).slice(0, LIMITS.maxMarks);
}
