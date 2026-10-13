// Reading the cases. A file is JSON Lines (one JSON object on each line) when its first character that is not white space is a
// "{", and a table (CSV, or TSV when the first line has tabs) otherwise. Both give the same cases. A record the tool cannot
// follow, or one with a field it cannot use, is a finding and is left out of the evaluation, never read as something else; a
// list is never cut to its first entries, because a cut list could let a case pass. JSON is parsed one line at a time with
// the parser of the platform, after a loop that refuses lines nested deeper than a case can be.

import { CSV_LIMITS, CsvError, cellAt, readTable } from './csv.js';
import { LIMITS } from './data.js';
import { FIELD_NAMES, FIELDS, nearest, normalizeName } from './fields.js';
import { nameKey, show } from './collect.js';

const LIST_SEPARATOR = ';';
const ALTERNATIVE_SEPARATOR = '|';
const MAX_COUNT = 100000000;

export const TABLE_LIMITS = { ...CSV_LIMITS, maxRows: LIMITS.maxCases, maxColumns: 40, maxCellLength: LIMITS.maxFieldChars };

class Invalid extends Error {}

const SPEC = new Map(FIELDS.map((f) => [f.name, f]));

// Whether the line is nested deeper than max levels of lists and objects. It walks the characters once and never recurses.
export function nestedTooDeep(line, max = LIMITS.maxJsonDepth) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line.charCodeAt(i);
    if (inString) {
      if (c === 92) i += 1;
      else if (c === 34) inString = false;
    } else if (c === 34) inString = true;
    else if (c === 91 || c === 123) {
      depth += 1;
      if (depth > max) return true;
    } else if (c === 93 || c === 125) depth -= 1;
  }
  return false;
}

const splitList = (text) => text.split(LIST_SEPARATOR).map((s) => s.trim()).filter((s) => s !== '');
const splitAlternatives = (text) => text.split(ALTERNATIVE_SEPARATOR).map((s) => s.trim()).filter((s) => s !== '');

function toText(value, name) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (name === 'id' && Number.isSafeInteger(value)) return String(value);
  throw new Invalid(`is ${kindOf(value)}, and ${name} is a text`);
}

function kindOf(value) {
  if (Array.isArray(value)) return 'a list';
  if (value === null) return 'null';
  return { string: 'a text', number: 'a number', boolean: 'true or false', object: 'an object' }[typeof value] ?? 'not a text';
}

function toList(value, name) {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return splitList(value);
  if (!Array.isArray(value)) throw new Invalid(`is ${kindOf(value)}, and ${name} is a list of texts`);
  return value.map((entry) => {
    if (typeof entry !== 'string') throw new Invalid(`holds ${kindOf(entry)} in its list; every entry of ${name} is a text`);
    return entry.trim();
  }).filter((s) => s !== '');
}

function toGroups(value, name) {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return splitList(value).map(splitAlternatives).filter((g) => g.length > 0);
  if (!Array.isArray(value)) throw new Invalid(`is ${kindOf(value)}, and ${name} is a list of groups`);
  return value.map((group) => {
    if (typeof group === 'string') return splitAlternatives(group);
    if (!Array.isArray(group)) throw new Invalid(`holds ${kindOf(group)} as a group; every group of ${name} is a list of texts, or a text with | between the alternatives`);
    return group.map((entry) => {
      if (typeof entry !== 'string') throw new Invalid(`holds ${kindOf(entry)} in a group; every alternative is a text`);
      return entry.trim();
    }).filter((s) => s !== '');
  }).filter((g) => g.length > 0);
}

function toYesNo(value, name) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') throw new Invalid(`is ${kindOf(value)}, and ${name} is yes or no`);
  const t = value.trim().toLowerCase();
  if (t === '' || t === 'no') return false;
  if (t === 'yes') return true;
  throw new Invalid(`is "${show(value, 30)}", and ${name} is yes, no or empty`);
}

function toCount(value, name) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const t = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[1-9][0-9]{0,8}$/.test(t) || Number(t) > MAX_COUNT) throw new Invalid(`is "${show(String(value), 30)}", and ${name} is a whole number from 1 to ${MAX_COUNT.toLocaleString('en-US')}`);
  return Number(t);
}

const CONVERT = { text: toText, list: toList, groups: toGroups, yesno: toYesNo, count: toCount };

// The lengths a field may have: a text up to the longest answer, a phrase up to maxPhraseChars (a source up to twice that),
// a list up to maxListEntries entries.
function checkSizes(name, value) {
  const spec = SPEC.get(name);
  if (spec.type === 'text' && value.length > LIMITS.maxFieldChars) throw new Invalid(`is longer than ${LIMITS.maxFieldChars.toLocaleString('en-US')} characters`);
  const cap = name.endsWith('sources') ? LIMITS.maxPhraseChars * 2 : LIMITS.maxPhraseChars;
  const flat = spec.type === 'groups' ? value.flat() : spec.type === 'list' ? value : [];
  if (spec.type === 'groups' && value.length > LIMITS.maxListEntries) throw new Invalid(`holds more than ${LIMITS.maxListEntries} groups; the tool does not read a part of a list`);
  if (flat.length > LIMITS.maxListEntries) throw new Invalid(`holds more than ${LIMITS.maxListEntries} entries; the tool does not read a part of a list`);
  if (flat.some((p) => p.length > cap)) throw new Invalid(`holds an entry longer than ${cap} characters`);
}

// The case of a record, or null when the record cannot be used. values is a Map of field name to the raw value of the
// record; where(name) gives the place of a field for a finding.
function buildCase(values, where, add, index) {
  const place = (name) => where(name);
  const out = { index, id: '', category: '', question: '', answer: '', facts: [], groups: [], forbidden: [], allowed: [], cited: [], sources: [], mustRefuse: false, maxChars: null, line: place('id').line, column: place('id').column, answerLine: 1, answerColumn: 1 };
  let usable = true;
  const converted = new Map();
  for (const [name, spec] of SPEC) {
    if (!values.has(name)) continue;
    try {
      const value = CONVERT[spec.type](values.get(name), name);
      checkSizes(name, value);
      converted.set(name, value);
    } catch (error) {
      if (!(error instanceof Invalid)) throw error;
      usable = false;
      add('field-invalid', place(name), `The field "${name}" ${error.message}; the record was left out.`, name);
    }
  }
  const text = (name) => converted.get(name) ?? '';
  out.id = text('id').trim();
  out.category = text('category').trim();
  out.question = text('question');
  out.answer = text('answer');
  out.facts = converted.get('expected_facts') ?? [];
  out.groups = converted.get('any_of') ?? [];
  out.forbidden = converted.get('forbidden') ?? [];
  out.allowed = converted.get('allowed_sources') ?? [];
  out.cited = converted.get('cited_sources') ?? [];
  out.sources = converted.get('sources') ?? [];
  out.mustRefuse = converted.get('must_refuse') ?? false;
  out.maxChars = converted.get('max_chars') ?? null;
  out.answerLine = place('answer').line;
  out.answerColumn = place('answer').column;
  if (usable && out.id === '') {
    usable = false;
    add('field-missing', place('id'), 'The record has no "id", which every case needs; the record was left out.', 'id');
  }
  if (usable && out.answer.trim() === '') {
    usable = false;
    add('field-missing', place('answer'), `The case "${show(out.id)}" has no "answer" (an empty answer is a missing one); the record was left out.`, 'answer');
  }
  return usable ? out : null;
}

// The cases of the lines of a JSON Lines file.
function readJsonLines(text, add, notes) {
  const lines = text.split(/\r\n|\n|\r/);
  const cases = [];
  let records = 0;
  let leftOut = 0;
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n];
    if (raw.trim() === '') continue;
    const line = n + 1;
    const here = { line, column: 1 };
    if (records >= LIMITS.maxCases) {
      notes.push(`the file holds more than ${LIMITS.maxCases.toLocaleString('en-US')} records; the tool read the first ${LIMITS.maxCases.toLocaleString('en-US')} and left the rest out`);
      break;
    }
    records += 1;
    if (nestedTooDeep(raw)) {
      add('record-unreadable', here, `The record is nested deeper than ${LIMITS.maxJsonDepth} levels, which no case needs; it was not parsed and was left out.`);
      leftOut += 1;
      continue;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      const at = /position (\d+)/.exec(error.message);
      add('record-unreadable', here, `The line is not valid JSON${at ? ` (near character ${at[1]})` : ''}; the record was left out.`);
      leftOut += 1;
      continue;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      add('record-unreadable', here, `The line is ${kindOf(value)}, and every line of a JSON Lines file is an object; the record was left out.`);
      leftOut += 1;
      continue;
    }
    const keys = Object.keys(value);
    if (keys.length > LIMITS.maxKeys) {
      add('record-unreadable', here, `The record has more than ${LIMITS.maxKeys} fields; the record was left out.`);
      leftOut += 1;
      continue;
    }
    const values = new Map();
    const names = new Map();
    for (const key of keys) {
      const name = normalizeName(key);
      if (!SPEC.has(name)) {
        const near = nearest(name, FIELD_NAMES);
        add('field-unknown', here, `The field "${show(key)}" is not a field the tool reads${near ? `; did you mean "${near}"?` : ''} Nothing under it is checked.`, key);
      } else if (values.has(name)) {
        add('field-invalid', here, `The keys "${show(names.get(name))}" and "${show(key)}" are the same field once case and separators are ignored; only the first is read.`, name);
      } else {
        values.set(name, value[key]);
        names.set(name, key);
      }
    }
    const made = buildCase(values, () => here, add, cases.length);
    if (made) cases.push(made);
    else leftOut += 1;
  }
  return { cases, records, leftOut };
}

// The cases of the rows of a table.
function readRows(table, add, notes) {
  const header = table.header;
  const index = new Map();
  header.cells.forEach((cell, i) => {
    const name = normalizeName(cell);
    const at = cellAt(header, i);
    if (!SPEC.has(name)) {
      const near = nearest(name, FIELD_NAMES);
      add('field-unknown', at, `The column "${show(cell)}" is not a field the tool reads${near ? `; did you mean "${near}"?` : ''} Nothing under it is checked.`, cell);
    } else if (index.has(name)) {
      add('field-invalid', at, `The column "${show(cell)}" has the same name as column ${index.get(name) + 1} once case and separators are ignored; only the first is read.`, name);
    } else index.set(name, i);
  });
  const missing = FIELDS.filter((f) => f.needed && !index.has(f.name)).map((f) => f.name);
  if (missing.length > 0) {
    add('field-missing', cellAt(header, 0), `The header has no "${missing.join('" and "')}" column, which every case needs. Nothing was checked.`, missing[0]);
    return { cases: [], records: table.rows.length, leftOut: table.rows.length };
  }
  const cases = [];
  let leftOut = 0;
  for (const row of table.rows) {
    if (row.cells.length !== header.cells.length) {
      add('record-unreadable', cellAt(row, 0), `The row has ${row.cells.length} cells but the header has ${header.cells.length}; the record was left out.`);
      leftOut += 1;
      continue;
    }
    const values = new Map();
    for (const [name, i] of index) values.set(name, row.cells[i]);
    const made = buildCase(values, (name) => (index.has(name) ? cellAt(row, index.get(name)) : cellAt(row, 0)), add, cases.length);
    if (made) cases.push(made);
    else leftOut += 1;
  }
  return { cases, records: table.rows.length, leftOut };
}

// The first character of the text that is not white space.
const firstChar = (text) => /\S/.exec(text)?.[0] ?? '';

// Reads the text of a file into { format, cases, records, leftOut, lines }. A file that cannot be read at all gives a
// file-unreadable finding and no cases.
export function readCases(text, add, notes) {
  const first = firstChar(text);
  if (first === '') {
    add('file-unreadable', { line: 1, column: 1 }, 'The file holds no text to read as cases. Nothing was checked.');
    return { format: 'JSONL', cases: [], records: 0, leftOut: 0 };
  }
  if (first === '[') {
    add('file-unreadable', { line: 1, column: 1 }, 'The file starts with a list. The tool reads JSON Lines, one object on each line, or a table. Nothing was checked.');
    return { format: 'JSONL', cases: [], records: 0, leftOut: 0 };
  }
  if (first === '{') {
    const read = readJsonLines(text, add, notes);
    if (read.records === 0) add('file-unreadable', { line: 1, column: 1 }, 'The file holds no records. Nothing was checked.');
    return { format: 'JSONL', ...read };
  }
  let table;
  try {
    table = readTable(text, { limits: TABLE_LIMITS });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    add('file-unreadable', { line: error.line, column: error.column }, `The file is not a table the reader can follow: ${error.message}. Nothing was checked.`);
    return { format: 'CSV', cases: [], records: 0, leftOut: 0 };
  }
  const format = table.delimiter === '\t' ? 'TSV' : 'CSV';
  notes.push(...table.notes);
  if (table.rows.length === 0) {
    add('file-unreadable', { line: 1, column: 1 }, 'The file holds a header and no rows, so there is nothing to check. Nothing was checked.');
    return { format, cases: [], records: 0, leftOut: 0 };
  }
  return { format, ...readRows(table, add, notes) };
}

// Ids compared without regard to case and runs of white space.
export const idKey = (id) => nameKey(id);
