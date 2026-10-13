import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, checkText, readOptions } from '../src/index.js';
import { BAD, EXPECTED, EXPLAIN, GOOD, GOOD_EXPECTED, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const BAD_FILE = 'examples/bad/cases.jsonl';
const GOOD_FILE = 'examples/good/cases.jsonl';

test('examples: the bad evaluation set fails with the report that is saved in examples/output', async () => {
  const r = await run(BAD);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('bad.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the good evaluation set passes at error, warning and info level with the report that is saved', async () => {
  const r = await run(GOOD);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('good.txt'));
  for (const e of GOOD_EXPECTED) assert.ok(r.out.includes(e), e);
  assert.equal((await run([...GOOD, '--fail-on', 'warning'])).code, 0);
  assert.equal((await run([...GOOD, '--fail-on', 'info'])).code, 0);
  assert.equal((await run([...GOOD, '--min-pass-rate', '100'])).code, 0);
  assert.doesNotMatch(r.out, /ERROR {4}|WARNING {2}|INFO {5}/);
  assert.doesNotMatch(r.out, /\nnote: /);
  assert.match(r.out, /\nfindings: 0\n/);
});

test('examples: every output saved in examples/output is the real output, in all five formats for both evaluation sets', async () => {
  const outputs = {
    'bad.txt': BAD,
    'bad.md': [...BAD, '--format', 'markdown'],
    'bad.json': [...BAD, '--json'],
    'bad.sarif': [...BAD, '--format', 'sarif'],
    'bad.junit.xml': [...BAD, '--format', 'junit'],
    'good.txt': GOOD,
    'good.md': [...GOOD, '--format', 'markdown'],
    'good.json': [...GOOD, '--json'],
    'good.sarif': [...GOOD, '--format', 'sarif'],
    'good.junit.xml': [...GOOD, '--format', 'junit'],
    'checks.txt': ['--list-checks'],
    'checks.md': ['--list-checks', '--format', 'markdown'],
    'checks.json': ['--list-checks', '--format', 'json'],
    'explain-fact-missing.txt': EXPLAIN,
    'explain-fact-missing.md': [...EXPLAIN, '--format', 'markdown']
  };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the pass rates of the good evaluation set are the ones counted by hand', async () => {
  const good = JSON.parse(await saved('good.json'));
  assert.deepEqual(good.summary.categories.map((c) => [c.category, c.cases, c.passed, c.passRate]), [['motor', 3, 3, '100.0'], ['home', 3, 3, '100.0'], ['travel', 2, 2, '100.0'], ['claims', 2, 2, '100.0'], ['boundaries', 3, 3, '100.0']]);
  assert.deepEqual(good.findings, []);
  assert.deepEqual(good.notes, []);
  assert.deepEqual([good.summary.records, good.summary.evaluated, good.summary.leftOut, good.summary.passRate], [13, 13, 0, '100.0']);
});

test('examples: the pass rates of the bad evaluation set are the ones counted by hand', async () => {
  const bad = JSON.parse(await saved('bad.json'));
  assert.deepEqual(bad.summary.categories.map((c) => [c.category, c.cases, c.passed, c.passRate, c.below]), [
    ['motor', 3, 1, '33.3', true],
    ['home', 3, 1, '33.3', true],
    ['travel', 3, 0, '0.0', true],
    ['claims', 3, 2, '66.7', true],
    ['(no category)', 1, 1, '100.0', false],
    ['boundaries', 2, 2, '100.0', false]
  ]);
  assert.deepEqual([bad.summary.records, bad.summary.evaluated, bad.summary.leftOut, bad.summary.passed, bad.summary.failed, bad.summary.passRate], [22, 15, 7, 7, 8, '46.7']);
});

test('examples: every check but file-unreadable fires on the bad evaluation set, each on the line built for it', async () => {
  const report = JSON.parse((await run([...BAD, '--json'])).out);
  const lines = (await readFile(resolve(root, BAD_FILE), 'utf8')).split('\n');
  // The place of the first line that holds needle.
  const at = (needle, n = 1) => {
    let seen = 0;
    for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(needle) && (seen += 1) === n) return `${BAD_FILE}:${i + 1}`;
    throw new Error(`${needle} x${n}`);
  };
  const where = (id) => report.findings.filter((f) => f.id === id).map((f) => f.at);
  assert.deepEqual(RULES.map((r) => r.id).filter((id) => where(id).length === 0), ['file-unreadable']);
  assert.deepEqual(where('record-unreadable'), [at('broken-001'), at('["id","category"'), at('deep-001')]);
  assert.deepEqual(where('field-missing'), [at('What time does the help desk open'), at('"id":"home-005"')]);
  assert.deepEqual(where('field-unknown'), [at('expected_fact"')]);
  assert.deepEqual(where('field-invalid'), [at('"maybe"'), at('"maybe"')]);
  assert.deepEqual(where('id-duplicate'), [at('"id":"MOTOR-001"')]);
  assert.deepEqual(where('question-empty'), [at('"id":"claims-003"')]);
  assert.deepEqual(where('case-checks-nothing'), [at('"id":"general-001"'), at('"id":"home-003"')]);
  assert.deepEqual(where('fact-missing'), [at('"id":"motor-002"'), at('"id":"motor-003"'), at('"id":"travel-002"')]);
  assert.deepEqual(where('source-not-allowed'), [at('"id":"home-001"')]);
  assert.deepEqual(where('source-missing'), [at('"id":"home-002"')]);
  assert.deepEqual(where('forbidden-phrase'), [at('"id":"motor-003"')]);
  assert.deepEqual(where('refusal-expected-but-answered'), [at('"id":"travel-001"')]);
  assert.deepEqual(where('answered-expected-refusal-instead'), [at('"id":"travel-002"')]);
  assert.deepEqual(where('answer-too-long'), [at('"id":"travel-003"')]);
  assert.deepEqual(where('secret-like'), [at('"id":"claims-001"')]);
  assert.deepEqual(where('pii-like'), [at('"id":"claims-002"')]);
  assert.equal(where('category-pass-rate-below').length, 4);
});

test('examples: the files are plain ASCII with LF line ends, with no date, no number that reads like a year and no token of a code host', async () => {
  for (const file of [BAD_FILE, GOOD_FILE]) {
    const text = await readFile(resolve(root, file), 'utf8');
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
    assert.ok(!text.includes('\r'), file);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, file);
    assert.doesNotMatch(text, /\b\d{4}-\d{2}-\d{2}\b/, file);
    assert.ok(text.endsWith('\n'), file);
    assert.ok(!text.includes(['gh', 'p_'].join('')) && !text.includes(['github', '_pat_'].join('')), file);
  }
  const good = await readFile(resolve(root, GOOD_FILE), 'utf8');
  assert.doesNotMatch(good, /lantern|4f2a9c7e|example\.com\/blog/);
});

test('examples: the made-up secrets and personal data are the kinds the tool is built to find, and are on example.com or from the published test set', async () => {
  const text = await readFile(resolve(root, BAD_FILE), 'utf8');
  const claims = text.split('\n').map((l) => (l.startsWith('{') && l.endsWith('}') ? JSON.parse(l) : null)).filter(Boolean);
  const answer = (id) => claims.find((c) => c.id === id).answer;
  const marks = checkText(`${JSON.stringify(claims.find((c) => c.id === 'claims-001'))}\n`, { options: readOptions({ minPassRate: '0' }) }).findings.map((f) => f.message).join(' ');
  assert.match(marks, /a seed phrase at character \d+ and a private key in hex at character \d+/);
  assert.match(answer('claims-002'), /[a-z.]+@example\.com/);
  assert.match(answer('claims-002'), /4111 1111 1111 1111/);
  for (const m of text.matchAll(/https?:\/\/[^\s",)\]]+/g)) assert.match(m[0], /^https:\/\/www\.example\.com\//, m[0]);
});

test('examples: only a made-up insurer is named, and every document id and address is made up', async () => {
  for (const file of [BAD_FILE, GOOD_FILE]) {
    const text = await readFile(resolve(root, file), 'utf8');
    for (const m of text.matchAll(/doc:[a-z0-9-]+/g)) assert.match(m[0], /^doc:(?:policy-(?:motor-7|home-3|travel-2)|faq-claims-1)$/, m[0]);
    assert.ok(text.includes('Acme'), file);
    for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g)) assert.match(m[0], /@example\.com$/, m[0]);
  }
});

test('examples: the good evaluation set has thirteen cases in five categories and uses every field and every kind of source', async () => {
  const lines = (await readFile(resolve(root, GOOD_FILE), 'utf8')).trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 13);
  const fields = new Set(lines.flatMap((c) => Object.keys(c)));
  for (const f of ['id', 'category', 'question', 'answer', 'expected_facts', 'any_of', 'forbidden', 'allowed_sources', 'cited_sources', 'sources', 'must_refuse', 'max_chars', 'note']) assert.ok(fields.has(f), f);
  assert.ok(lines.some((c) => c.allowed_sources?.some((s) => s.endsWith('*'))), 'a prefix');
  assert.ok(lines.some((c) => /\[1\]/.test(c.answer)), 'a marker');
  assert.ok(lines.some((c) => /https:\/\//.test(c.answer)), 'a web address in an answer');
  assert.ok(lines.some((c) => c.must_refuse === 'yes') && lines.some((c) => c.must_refuse === 'no'));
});

test('examples: the JUnit report of the bad evaluation set is well formed and counts what the JSON report counts', async () => {
  const xml = await saved('bad.junit.xml');
  const json = JSON.parse(await saved('bad.json'));
  assert.equal([...xml.matchAll(/<testcase /g)].length, json.summary.evaluated + json.findings.filter((f) => f.kind === 'input').length + json.summary.categories.length);
  assert.equal([...xml.matchAll(/<failure /g)].length, json.summary.failed + json.summary.categories.filter((c) => c.below).length);
  assert.equal([...xml.matchAll(/<error /g)].length, json.findings.filter((f) => f.kind === 'input').length);
  assert.equal((xml.match(/<testsuite /g) ?? []).length, (xml.match(/<\/testsuite>/g) ?? []).length);
  const open = [...xml.matchAll(/<(\/?)(testsuites|testsuite|testcase|failure|error|system-out)\b[^>]*?(\/?)>/g)];
  const stack = [];
  for (const [, closing, name, selfClosing] of open) {
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name);
    else stack.push(name);
  }
  assert.deepEqual(stack, []);
  assert.doesNotMatch(await saved('good.junit.xml'), /<failure|<error/);
});
