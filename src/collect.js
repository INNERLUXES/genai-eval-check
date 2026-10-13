// What every check shares: the findings with their line and column, kept at most FINDING_CAP for each check and counted past
// that, and the small helpers that show a text.

import { safeText } from './text.js';

// How many findings of one check are kept; the rest are counted in omitted.
export const FINDING_CAP = 1000;

// Text from the input as a message shows it.
export const show = (t, max = 60) => safeText(t, max);

// A name compared without regard to case and runs of white space.
export const nameKey = (t) => t.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

// A list for a sentence: "a", "a and b", "a, b and c", and "a, b, c and 4 more" past the limit.
export function list(items, max = 6) {
  const shown = items.slice(0, max);
  const more = items.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more.toLocaleString('en-US')} more`;
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

// The place to collect findings: add(id, where, message, subject) keeps the first FINDING_CAP of each check. where is
// { line, column, caseIndex }.
export function createCollector() {
  const findings = [];
  const counts = new Map();
  const omitted = new Map();
  const notes = [];
  const add = (id, where, message, subject = null) => {
    const seen = (counts.get(id) ?? 0) + 1;
    counts.set(id, seen);
    if (seen > FINDING_CAP) omitted.set(id, (omitted.get(id) ?? 0) + 1);
    else findings.push({ id, line: where.line, column: where.column, caseIndex: where.caseIndex ?? null, message, subject });
  };
  return { findings, omitted, notes, add };
}
