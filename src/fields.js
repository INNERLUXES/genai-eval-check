// The fields of a case. The names and the types are this tool's own choice: no standard fixes them. A field is found by its
// name with case and separators ignored, in a CSV or TSV header and in the keys of a JSON Lines record alike.

export const normalizeName = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// type: text, list (a JSON list of texts, or a ";" list in a cell), groups (a list of lists of alternatives; in a cell, groups
// separated by ";" and alternatives by "|"), yesno and count.
export const FIELDS = [
  { name: 'id', type: 'text', needed: true, summary: 'the name of the case, different on every record; shown in every finding and used as the name of the test in the JUnit report' },
  { name: 'category', type: 'text', needed: false, summary: 'the group the case counts in for the pass rate; empty means no category' },
  { name: 'question', type: 'text', needed: false, summary: 'the question that was asked; it is never matched, only required to be there' },
  { name: 'answer', type: 'text', needed: true, summary: 'the answer that was given, as text; it is the only text that is searched' },
  { name: 'expected_facts', type: 'list', needed: false, summary: 'phrases that must all appear in the answer' },
  { name: 'any_of', type: 'groups', needed: false, summary: 'groups of alternative phrasings; at least one phrase of every group must appear' },
  { name: 'forbidden', type: 'list', needed: false, summary: 'phrases that must not appear in the answer' },
  { name: 'allowed_sources', type: 'list', needed: false, summary: 'the web addresses and document ids the answer may cite; a trailing * makes an entry a prefix' },
  { name: 'cited_sources', type: 'list', needed: false, summary: 'the sources the answer cited; when empty, they are read from the answer' },
  { name: 'sources', type: 'list', needed: false, summary: 'what the markers [1], [2] and so on of the answer stand for, in order' },
  { name: 'must_refuse', type: 'yesno', needed: false, summary: 'yes when the right answer is a refusal, no or empty otherwise' },
  { name: 'max_chars', type: 'count', needed: false, summary: 'the most characters the answer may have' },
  { name: 'note', type: 'text', needed: false, summary: 'free text for the reader; kept, never compared' }
];

export const FIELD_NAMES = FIELDS.map((f) => f.name);

// The number of edits (insert, delete, replace) between two short texts, capped.
export function editDistance(a, b) {
  const x = a.slice(0, 60);
  const y = b.slice(0, 60);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

// The name nearest to a text, within two edits, or null.
export function nearest(text, names) {
  let best = null;
  let bestDistance = 3;
  for (const n of names) {
    const d = editDistance(text, n);
    if (d < bestDistance) {
      best = n;
      bestDistance = d;
    }
  }
  return best;
}
