// Shared test helpers: cases built inline as JSON Lines or CSV text, checked in memory or written into a temporary folder that
// is removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the reader does, so a test never holds a
// line number worked out by hand for one system only. No test reads the clock, the time zone or the locale. Every company,
// person and number in the tests is made up, and every address is on example.com.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkText, main, readOptions } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'genai-eval-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

// A case that passes every check; over replaces fields, and a field set to undefined is left out.
export const kase = (over = {}) => {
  const out = { id: 'q1', category: 'motor', question: 'How long do I have to report an accident?', answer: 'You must report an accident within 30 days.', expected_facts: ['within 30 days'], ...over };
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete out[k];
  return out;
};

// JSON Lines text of cases (objects, or strings that are written as they are).
export const jsonl = (cases) => `${cases.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('\n')}\n`;

const quote = (v) => (/[",\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// A table as text: the header and the rows (arrays of cells), with LF line ends.
export const table = (columns, rows, delimiter = ',') => `${[columns.join(delimiter), ...rows.map((r) => r.map(quote).join(delimiter))].join('\n')}\n`;

// The findings of a run in memory.
export const findingsOf = (text, options = {}) => checkText(text, { options: readOptions(options) }).findings;

// The ids of the findings of a run.
export const idsOf = (text, options) => findingsOf(text, options).map((f) => f.id);

// The findings of one check.
export const ofCheck = (text, id, options) => findingsOf(text, options).filter((f) => f.id === id);

// The whole run in memory.
export const runOf = (text, options = {}) => checkText(text, { options: readOptions(options) });

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

// A clean file and one with a fact missing, for the command line tests.
export const GOOD = { 'cases.jsonl': jsonl([kase()]) };
export const BAD = { 'cases.jsonl': jsonl([kase({ answer: 'Whenever you like.' })]) };
export const ARGS = ['cases.jsonl'];

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
