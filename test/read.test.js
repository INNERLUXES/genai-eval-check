import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS, createCollector, nestedTooDeep, readCases } from '../src/index.js';
import { jsonl, kase, lineOf, ofCheck, runOf, table } from './helpers.js';

const read = (text) => {
  const c = createCollector();
  const r = readCases(text, c.add, c.notes);
  return { ...r, findings: c.findings, notes: c.notes };
};
const ids = (r) => r.findings.map((f) => f.id);

test('readCases: JSON Lines, one case on each line, with every field read into its place', () => {
  const r = read(jsonl([kase({ expected_facts: ['a', 'b'], any_of: [['x', 'y'], 'p|q'], forbidden: ['bad'], allowed_sources: ['doc:one'], cited_sources: ['doc:two'], sources: ['doc:three'], must_refuse: 'yes', max_chars: 50, note: 'n' })]));
  assert.equal(r.format, 'JSONL');
  assert.equal(r.records, 1);
  assert.deepEqual(r.findings, []);
  const [c] = r.cases;
  assert.equal(c.id, 'q1');
  assert.equal(c.category, 'motor');
  assert.deepEqual(c.facts, ['a', 'b']);
  assert.deepEqual(c.groups, [['x', 'y'], ['p', 'q']]);
  assert.deepEqual([c.forbidden, c.allowed, c.cited, c.sources], [['bad'], ['doc:one'], ['doc:two'], ['doc:three']]);
  assert.equal(c.mustRefuse, true);
  assert.equal(c.maxChars, 50);
  assert.deepEqual([c.line, c.answerLine], [1, 1]);
});

test('readCases: field names are found with case and separators ignored, in a record and in a header', () => {
  const r = read(jsonl([{ ID: 'q1', 'Expected Facts': ['a'], 'ANSWER': 'a b', 'Must-Refuse': true, 'Max Chars': '12' }]));
  assert.deepEqual(r.findings, []);
  assert.deepEqual([r.cases[0].facts, r.cases[0].mustRefuse, r.cases[0].maxChars], [['a'], true, 12]);
  const t = read(table(['ID', 'Expected Facts', 'ANSWER'], [['q1', 'a', 'a b']]));
  assert.deepEqual(t.findings, []);
  assert.deepEqual(t.cases[0].facts, ['a']);
});

test('readCases: a table is read with commas or tabs, and a cell holds a list separated by ; and alternatives separated by |', () => {
  const cols = ['id', 'category', 'question', 'answer', 'expected_facts', 'any_of', 'forbidden', 'allowed_sources', 'must_refuse', 'max_chars'];
  const row = ['q1', 'motor', 'Q?', 'the answer', ' a ; b ;; c ', 'x | y ; p', 'bad;worse', 'doc:one;doc:two', 'NO', '40'];
  for (const delimiter of [',', '\t']) {
    const r = read(table(cols, [row], delimiter));
    assert.equal(r.format, delimiter === ',' ? 'CSV' : 'TSV');
    assert.deepEqual(r.findings, [], delimiter);
    const [c] = r.cases;
    assert.deepEqual(c.facts, ['a', 'b', 'c']);
    assert.deepEqual(c.groups, [['x', 'y'], ['p']]);
    assert.deepEqual([c.forbidden, c.allowed, c.mustRefuse, c.maxChars], [['bad', 'worse'], ['doc:one', 'doc:two'], false, 40]);
  }
});

test('readCases: a cell in quotes keeps commas, quotes and line ends, and the answer line is the line the cell starts on', () => {
  const text = 'id,answer,expected_facts\nq1,"say ""hi"", then\nleave",hi\nq2,plain,plain\n';
  const r = read(text);
  assert.equal(r.cases[0].answer, 'say "hi", then\nleave');
  assert.deepEqual([r.cases[0].line, r.cases[0].answerLine, r.cases[1].line], [2, 2, lineOf(text, 'q2')]);
});

test('readCases: LF, CRLF and CR line ends give the same cases and the same lines, in both formats', () => {
  const lf = jsonl([kase({ id: 'a' }), kase({ id: 'b' })]);
  for (const end of ['\r\n', '\r']) {
    const r = read(lf.split('\n').join(end));
    assert.deepEqual(r.cases.map((c) => [c.id, c.line]), [['a', 1], ['b', 2]], JSON.stringify(end));
  }
  const csv = table(['id', 'answer'], [['a', 'x'], ['b', 'y']]);
  for (const end of ['\r\n', '\r']) assert.deepEqual(read(csv.split('\n').join(end)).cases.map((c) => [c.id, c.line]), [['a', 2], ['b', 3]]);
});

test('readCases: blank lines are skipped in JSON Lines and keep the line numbers of the lines after them', () => {
  const text = `\n${JSON.stringify(kase({ id: 'a' }))}\n\n   \n${JSON.stringify(kase({ id: 'b' }))}\n`;
  assert.deepEqual(read(text).cases.map((c) => [c.id, c.line]), [['a', 2], ['b', 5]]);
});

test('readCases: a line that is not JSON is a record-unreadable finding with its line, no text of the line, and the other lines are still read', () => {
  const secret = 'ab12'.repeat(16);
  const text = `${JSON.stringify(kase({ id: 'a' }))}\n{"id":"b","answer":"${secret} never closed\n${JSON.stringify(kase({ id: 'c' }))}\n`;
  const r = read(text);
  assert.deepEqual(r.cases.map((c) => c.id), ['a', 'c']);
  assert.deepEqual(r.findings.map((f) => [f.id, f.line]), [['record-unreadable', 2]]);
  assert.ok(!r.findings[0].message.includes(secret));
  assert.equal(r.leftOut, 1);
  assert.equal(r.records, 3);
});

test('readCases: a line that is a list, a text, a number or null is not an object', () => {
  const text = ['{"id":"a","answer":"x"}', '[1]', '"x"', '12', 'null', 'true'].join('\n');
  const r = read(text);
  assert.equal(r.cases.length, 1);
  assert.deepEqual(r.findings.map((f) => f.id), ['record-unreadable', 'record-unreadable', 'record-unreadable', 'record-unreadable', 'record-unreadable']);
  assert.match(r.findings[0].message, /The line is a list/);
  assert.match(r.findings[1].message, /The line is a text/);
  assert.match(r.findings[2].message, /The line is a number/);
  assert.match(r.findings[3].message, /The line is null/);
  assert.match(r.findings[4].message, /The line is true or false/);
});

test('nestedTooDeep: lists and objects deeper than the limit, with brackets inside texts and escaped quotes ignored', () => {
  assert.equal(nestedTooDeep('{"a":[["b"]]}'), false, 'three levels');
  assert.equal(nestedTooDeep('{"a":[[["b"]]]}'), false, 'four levels');
  assert.equal(nestedTooDeep('{"a":[[[["b"]]]]}'), true, 'five levels');
  assert.equal(nestedTooDeep('{"a":"[[[[[[[[[["}'), false, 'brackets in a text');
  assert.equal(nestedTooDeep('{"a":"\\"[[[[[[[[[[\\""}'), false, 'an escaped quote does not end the text');
  assert.equal(nestedTooDeep('['.repeat(WORK_LIMITS.maxJsonDepth + 1)), true);
  assert.equal(nestedTooDeep('['.repeat(WORK_LIMITS.maxJsonDepth)), false);
  assert.equal(nestedTooDeep('['.repeat(200000)), true, 'long runs end at once');
});

test('readCases: a record nested deeper than a case can be is refused before it is parsed, with a clear message', () => {
  const r = read(`{"id":"a","answer":"x","any_of":${'['.repeat(100000)}${']'.repeat(100000)}}\n`);
  assert.deepEqual(r.cases, []);
  assert.deepEqual(ids(r), ['record-unreadable']);
  assert.match(r.findings[0].message, /nested deeper than 4 levels/);
});

test('readCases: a record with more fields than a case can have is refused', () => {
  const record = Object.fromEntries(Array.from({ length: WORK_LIMITS.maxKeys + 1 }, (_, i) => [`f${i}`, 'x']));
  const r = read(`${JSON.stringify(record)}\n`);
  assert.deepEqual(ids(r), ['record-unreadable']);
  assert.match(r.findings[0].message, /more than 100 fields/);
});

test('readCases: a field the tool does not read is a finding that names it and the nearest field, and the case is still read', () => {
  const r = read(jsonl([{ id: 'a', answer: 'x', expected_fact: ['x'], zebra: 1 }]));
  assert.equal(r.cases.length, 1);
  assert.deepEqual(r.findings.map((f) => [f.id, f.subject]), [['field-unknown', 'expected_fact'], ['field-unknown', 'zebra']]);
  assert.match(r.findings[0].message, /did you mean "expected_facts"\?/);
  assert.doesNotMatch(r.findings[1].message, /did you mean/);
  const t = read(table(['id', 'answer', 'expected_fact'], [['a', 'x', 'x']]));
  assert.deepEqual(t.findings.map((f) => [f.id, f.line, f.column]), [['field-unknown', 1, 11]]);
  assert.equal(t.cases.length, 1);
});

test('readCases: names such as __proto__ and constructor are only unknown fields, and change nothing', () => {
  const r = read('{"id":"a","answer":"x","__proto__":{"polluted":true},"constructor":1,"toString":2}\n');
  assert.equal(r.cases.length, 1);
  assert.deepEqual(r.findings.map((f) => f.subject), ['__proto__', 'constructor', 'toString']);
  assert.equal({}.polluted, undefined);
  assert.equal(r.cases[0].facts.length, 0);
});

test('readCases: two keys or columns that are the same field once case and separators are ignored: the first is read, the second is a finding', () => {
  const r = read('{"id":"a","answer":"first","Answer":"second"}\n');
  assert.equal(r.cases[0].answer, 'first');
  assert.deepEqual(ids(r), ['field-invalid']);
  const t = read('id,answer,Answer\na,first,second\n');
  assert.equal(t.cases[0].answer, 'first');
  assert.deepEqual(t.findings.map((f) => [f.id, f.line, f.column]), [['field-invalid', 1, 11]]);
});

test('readCases: a record with no id, or no answer (an empty one is missing), is left out with a finding at its line', () => {
  const text = jsonl([{ answer: 'x' }, { id: 'a' }, { id: 'b', answer: '   ' }, { id: ' ', answer: 'x' }, kase({ id: 'ok' })]);
  const r = read(text);
  assert.deepEqual(r.cases.map((c) => c.id), ['ok']);
  assert.deepEqual(r.findings.map((f) => [f.id, f.line]), [['field-missing', 1], ['field-missing', 2], ['field-missing', 3], ['field-missing', 4]]);
  assert.equal(r.leftOut, 4);
  assert.match(r.findings[0].message, /no "id"/);
  assert.match(r.findings[1].message, /The case "a" has no "answer"/);
});

test('readCases: a header without an id or an answer column is one finding, and nothing is checked', () => {
  const r = read(table(['question', 'answer'], [['q', 'a']]));
  assert.deepEqual(r.findings.map((f) => [f.id, f.line]), [['field-missing', 1]]);
  assert.match(r.findings[0].message, /no "id" column/);
  assert.deepEqual(r.cases, []);
  const both = read(table(['question'], [['q']]));
  assert.match(both.findings[0].message, /no "id" and "answer" column/);
});

test('readCases: a field of the wrong type is a finding that names the field and the record is left out', () => {
  const bad = [
    { id: 'a', answer: 'x', expected_facts: 5 },
    { id: 'b', answer: 'x', expected_facts: [1] },
    { id: 'c', answer: 'x', any_of: 'p|q;r' },
    { id: 'd', answer: 'x', any_of: [5] },
    { id: 'e', answer: 'x', any_of: [[5]] },
    { id: 'f', answer: 'x', must_refuse: 'maybe' },
    { id: 'g', answer: 'x', must_refuse: 1 },
    { id: 'h', answer: 'x', max_chars: 'ten' },
    { id: 'i', answer: 'x', max_chars: 1.5 },
    { id: 'j', answer: 'x', max_chars: 0 },
    { id: 'k', answer: 'x', max_chars: 1000000000 },
    { id: 'l', answer: 5 },
    { id: 'm', answer: 'x', question: ['q'] },
    { id: 'n', answer: 'x', category: { a: 1 } },
    { id: 'o', answer: 'x', note: true },
    { id: {}, answer: 'x' }
  ];
  const r = read(jsonl(bad));
  assert.deepEqual(r.cases.map((c) => c.id), ['c'], 'a string is read as a list of texts');
  assert.equal(r.leftOut, bad.length - 1);
  assert.ok(r.findings.every((f) => f.id === 'field-invalid' || f.id === 'field-missing'));
  assert.match(r.findings[0].message, /The field "expected_facts" is a number, and expected_facts is a list of texts/);
  assert.match(r.findings[1].message, /holds a number in its list/);
  assert.match(r.findings.find((f) => f.line === 8).message, /is "ten", and max_chars is a whole number/);
});

test('readCases: must_refuse is yes or no in any case, empty is no, and true or false are read in JSON', () => {
  const r = read(jsonl([{ id: 'a', answer: 'x', must_refuse: 'Yes' }, { id: 'b', answer: 'x', must_refuse: ' NO ' }, { id: 'c', answer: 'x', must_refuse: '' }, { id: 'd', answer: 'x', must_refuse: true }, { id: 'e', answer: 'x', must_refuse: false }, { id: 'f', answer: 'x', must_refuse: null }, { id: 'g', answer: 'x' }]));
  assert.deepEqual(r.cases.map((c) => c.mustRefuse), [true, false, false, true, false, false, false]);
  assert.deepEqual(r.findings, []);
});

test('readCases: an id may be a whole number in JSON, and a max_chars a number or a text of digits', () => {
  const r = read(jsonl([{ id: 7, answer: 'x', max_chars: 20 }, { id: 8, answer: 'x', max_chars: '30' }]));
  assert.deepEqual(r.cases.map((c) => [c.id, c.maxChars]), [['7', 20], ['8', 30]]);
});

test('readCases: a list or a phrase over the limit is a finding and the record is left out, never cut', () => {
  const many = Array.from({ length: WORK_LIMITS.maxListEntries + 1 }, (_, i) => `f${i}`);
  const exact = Array.from({ length: WORK_LIMITS.maxListEntries }, (_, i) => `f${i}`);
  const long = 'a'.repeat(WORK_LIMITS.maxPhraseChars + 1);
  const r = read(jsonl([
    { id: 'a', answer: 'x', expected_facts: many },
    { id: 'b', answer: 'x', expected_facts: exact },
    { id: 'c', answer: 'x', forbidden: [long] },
    { id: 'd', answer: 'x', any_of: [many] },
    { id: 'e', answer: 'x', any_of: many.map((f) => [f]) },
    { id: 'f', answer: 'x', allowed_sources: ['a'.repeat(WORK_LIMITS.maxPhraseChars * 2 + 1)] },
    { id: 'g', answer: 'x', allowed_sources: ['a'.repeat(WORK_LIMITS.maxPhraseChars * 2)] }
  ]));
  assert.deepEqual(r.cases.map((c) => c.id), ['b', 'g']);
  assert.equal(r.findings.length, 5);
  assert.match(r.findings[0].message, /more than 1000 entries; the tool does not read a part of a list/);
  assert.match(r.findings[1].message, /an entry longer than 1000 characters/);
  assert.match(r.findings[3].message, /more than 1000 groups/);
});

test('readCases: a field longer than the longest answer is a finding', () => {
  const r = read(`${JSON.stringify({ id: 'a', answer: 'x'.repeat(WORK_LIMITS.maxFieldChars + 1) })}\n`);
  assert.deepEqual(ids(r), ['field-invalid']);
  assert.match(r.findings[0].message, /longer than 12,000,000 characters/);
});

test('readCases: a file that is empty, a list, or has a header and no rows, or a table the reader cannot follow, is file-unreadable at the place it stopped', () => {
  for (const text of ['', '   \n\n']) {
    const r = read(text);
    assert.deepEqual(r.findings.map((f) => [f.id, f.line]), [['file-unreadable', 1]]);
    assert.match(r.findings[0].message, /holds no text/);
  }
  assert.match(read('[{"id":"a"}]').findings[0].message, /starts with a list/);
  assert.match(read('id,answer\n').findings[0].message, /header and no rows/);
  assert.match(read('{}\n\n').findings.at(-1).message, /holds no records|nothing|case needs/i);
  const open = read('id,answer\na,"never closed\n');
  assert.deepEqual(open.findings.map((f) => [f.id, f.line, f.column]), [['file-unreadable', 2, 3]]);
  assert.match(open.findings[0].message, /quote that opens the cell was never closed/);
  assert.match(read('id;answer\na;b\n').findings[0].message, /separated by semicolons/);
});

test('readCases: a row with more or fewer cells than the header is left out with its line, and the next rows are still read', () => {
  const r = read('id,answer,expected_facts\nq1,x,x\nq2,x\nq3,x,x,extra\nq4,y,y\n');
  assert.deepEqual(r.cases.map((c) => c.id), ['q1', 'q4']);
  assert.deepEqual(r.findings.map((f) => [f.id, f.line]), [['record-unreadable', 3], ['record-unreadable', 4]]);
  assert.match(r.findings[0].message, /The row has 2 cells but the header has 3/);
  assert.equal(r.leftOut, 2);
  assert.equal(r.records, 4);
});

test('readCases: more records than the limit are left out with a note, in both formats', () => {
  const lines = Array.from({ length: WORK_LIMITS.maxCases + 2 }, (_, i) => `{"id":"c${i}","answer":"x"}`).join('\n');
  const r = read(lines);
  assert.equal(r.cases.length, WORK_LIMITS.maxCases);
  assert.ok(r.notes.some((n) => /more than 250,000 records; the tool read the first 250,000/.test(n)));
  const csv = `id,answer\n${Array.from({ length: WORK_LIMITS.maxCases + 2 }, (_, i) => `c${i},x`).join('\n')}\n`;
  const t = read(csv);
  assert.equal(t.cases.length, WORK_LIMITS.maxCases);
  assert.ok(t.notes.some((n) => /250000 rows/.test(n)));
});

test('checkText: the same cases in JSON Lines, CSV and TSV, with any line ends, give the same findings', () => {
  const cases = [kase({ id: 'a' }), kase({ id: 'b', answer: 'Never.', expected_facts: ['within 30 days'] })];
  const cols = ['id', 'category', 'question', 'answer', 'expected_facts'];
  const rows = cases.map((c) => [c.id, c.category, c.question, c.answer, c.expected_facts.join(';')]);
  const shape = (text) => runOf(text).findings.map((f) => [f.id, f.message]);
  const expected = shape(jsonl(cases));
  assert.deepEqual(expected.map((e) => e[0]), ['fact-missing', 'category-pass-rate-below']);
  assert.deepEqual(shape(table(cols, rows)), expected);
  assert.deepEqual(shape(table(cols, rows, '\t')), expected);
  assert.deepEqual(shape(table(cols, rows).split('\n').join('\r\n')), expected);
  assert.deepEqual(shape(jsonl(cases).split('\n').join('\r\n')), expected);
  assert.equal(ofCheck(jsonl(cases), 'fact-missing')[0].line, 2);
});
