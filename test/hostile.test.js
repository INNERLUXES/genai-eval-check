import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDING_CAP, InputError, TABLE_LIMITS, WORK_LIMITS, checkText, createWork, findPhrase, findPiiLike, findSecretLike, readOptions } from '../src/index.js';
import { allowed, cli, jsonl, kase, withFiles } from './helpers.js';

// Each test builds input meant to make the tool slow or to exhaust the stack or the memory, and checks that it ends with an
// answer in good time. The time allowed is four times as long under coverage (NODE_V8_COVERAGE is set only when coverage
// is on).

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

const run = (text, options = {}) => checkText(text, { options: readOptions(options) });

test('a hundred thousand cases in ten categories: all checked in good time, with the pass rates exact', () => {
  const lines = Array.from({ length: 100000 }, (_, i) => JSON.stringify(kase({ id: `c${i}`, category: `k${i % 10}`, answer: Math.floor(i / 10) % 100 === 0 ? 'Never.' : 'You must report an accident within 30 days, see doc:policy-motor-7.', allowed_sources: ['doc:policy-motor-7'] })));
  const { value, ms } = timed(() => run(`${lines.join('\n')}\n`));
  assert.equal(value.cases.length, 100000);
  assert.equal(value.cases.filter((c) => !c.passed).length, 1000);
  assert.equal(value.categories.length, 10);
  assert.ok(value.categories.every((c) => c.cases === 10000 && c.passed === 9900 && c.passRate === '99.0' && !c.below));
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a hundred thousand cases with the same mistake: the first of each check are listed, the rest counted, and every case is still counted', () => {
  const lines = Array.from({ length: 100000 }, (_, i) => JSON.stringify(kase({ id: `c${i}`, answer: 'Never.' })));
  const { value, ms } = timed(() => run(`${lines.join('\n')}\n`, { minPassRate: '0' }));
  assert.equal(value.findings.filter((f) => f.id === 'fact-missing').length, FINDING_CAP);
  assert.equal(value.omitted.get('fact-missing'), 100000 - FINDING_CAP);
  assert.equal(value.cases.filter((c) => !c.passed).length, 100000);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a hundred thousand cases with one id, and a hundred thousand categories: counted and bounded', () => {
  const same = Array.from({ length: 100000 }, () => JSON.stringify(kase()));
  const dup = timed(() => run(`${same.join('\n')}\n`));
  assert.equal(dup.value.cases.length, 1);
  assert.equal(dup.value.findings.filter((f) => f.id === 'id-duplicate').length, FINDING_CAP);
  assert.equal(dup.value.leftOut, 99999);
  assert.ok(dup.ms < allowed(30000), `took ${dup.ms} ms`);
  const each = Array.from({ length: 100000 }, (_, i) => JSON.stringify(kase({ id: `c${i}`, category: `k${i}`, answer: i % 2 ? 'Never.' : 'Within 30 days.' })));
  const many = timed(() => run(`${each.join('\n')}\n`));
  assert.equal(many.value.categories.length, 100000);
  assert.equal(many.value.findings.filter((f) => f.id === 'category-pass-rate-below').length, FINDING_CAP);
  assert.ok(many.ms < allowed(30000), `took ${many.ms} ms`);
});

test('an answer of ten million characters is searched in good time, for facts, phrases, citations, secrets and personal data', () => {
  const answer = 'The excess is 250 and doc:policy-motor-7 applies. '.repeat(200000);
  assert.equal(answer.length, 10000000);
  const text = jsonl([kase({ answer, expected_facts: ['the excess is 250', 'nothing of the kind'], forbidden: ['zzz'], allowed_sources: ['doc:policy-motor-7'], max_chars: 100 })]);
  const { value, ms } = timed(() => run(text, { minPassRate: '0' }));
  assert.deepEqual(value.findings.map((f) => f.id).sort(), ['answer-too-long', 'fact-missing']);
  assert.ok(ms < allowed(20000), `took ${ms} ms`);
});

test('an answer of ten million characters of one letter, of numbers and spaces, and of at signs: linear time', () => {
  const cases = [
    'a'.repeat(10000000),
    '1 '.repeat(5000000),
    `${'@'.repeat(5000000)}${'a'.repeat(5000000)}`,
    `${'a@'.repeat(2500000)}`,
    `${'lantern '.repeat(1250000)}`,
    `${'-'.repeat(10000000)}`
  ];
  for (const answer of cases) {
    const { ms } = timed(() => run(jsonl([kase({ answer, expected_facts: ['aaaab', 'a b'], forbidden: ['a'] })]), { minPassRate: '0' }));
    assert.ok(ms < allowed(20000), `took ${ms} ms for ${answer.slice(0, 12)}`);
  }
  assert.ok(timed(() => findSecretLike('a'.repeat(10000000))).ms < allowed(5000));
  assert.ok(timed(() => findPiiLike('1'.repeat(10000000))).ms < allowed(5000));
  assert.ok(timed(() => findPiiLike('0-'.repeat(5000000))).ms < allowed(5000));
});

test('a list of a million facts is refused with a clear message in good time, and so is a million groups', () => {
  const facts = Array.from({ length: 1000000 }, (_, i) => `fact ${i}`);
  const one = timed(() => run(jsonl([{ id: 'a', question: 'q', answer: 'x', expected_facts: facts }])));
  assert.deepEqual(one.value.findings.map((f) => f.id), ['field-invalid']);
  assert.match(one.value.findings[0].message, /more than 1000 entries; the tool does not read a part of a list/);
  assert.deepEqual(one.value.cases, []);
  assert.ok(one.ms < allowed(10000), `took ${one.ms} ms`);
  const groups = timed(() => run(jsonl([{ id: 'a', question: 'q', answer: 'x', any_of: facts.map((f) => [f]) }])));
  assert.match(groups.value.findings[0].message, /more than 1000 groups/);
  assert.ok(groups.ms < allowed(10000), `took ${groups.ms} ms`);
});

test('the most facts a case may list, against a long answer, in all lists at once', () => {
  const list = (p) => Array.from({ length: WORK_LIMITS.maxListEntries }, (_, i) => `${p} ${i}`);
  const answer = 'word '.repeat(200000);
  const { value, ms } = timed(() => run(jsonl([kase({ answer, expected_facts: list('fact'), forbidden: list('bad'), any_of: [list('alt')], allowed_sources: list('doc:s') })]), { minPassRate: '0' }));
  assert.deepEqual(value.findings.map((f) => f.id).sort(), ['fact-missing', 'source-missing']);
  assert.ok(ms < allowed(20000), `took ${ms} ms`);
});

test('a work limit stops a run that would search more text than it may, with an input error and no report', async () => {
  const text = jsonl([kase({ answer: 'x '.repeat(50000), expected_facts: Array.from({ length: 200 }, (_, i) => `f${i}`) })]);
  assert.throws(() => checkText(text, { limits: { ...WORK_LIMITS, maxWork: 1000000 }, options: readOptions() }), (e) => e instanceof InputError && /work limit of 1,000,000 characters searched is reached/.test(e.message));
  await withFiles({ 'cases.jsonl': text }, async (dir) => {
    const r = await cli(['cases.jsonl'], dir);
    assert.ok(r.code === 0 || r.code === 1);
  });
  const work = createWork(WORK_LIMITS.maxWork);
  assert.equal(work.left, 8000000000);
  assert.equal(findPhrase('a b', 'b', 0, work), 2);
});

test('JSON nested a hundred thousand levels deep is refused before it is parsed, in good time, and so are long runs of brackets and quotes', () => {
  const deep = `{"id":"a","answer":"x","any_of":${'['.repeat(100000)}${']'.repeat(100000)}}\n`;
  const one = timed(() => run(deep));
  assert.match(one.value.findings[0].message, /nested deeper than 4 levels/);
  assert.ok(one.ms < allowed(3000), `took ${one.ms} ms`);
  const objects = timed(() => run(`${'{"a":'.repeat(100000)}1${'}'.repeat(100000)}\n`));
  assert.deepEqual(objects.value.findings.map((f) => f.id), ['record-unreadable']);
  assert.ok(objects.ms < allowed(3000), `took ${objects.ms} ms`);
  const quotes = timed(() => run(`{"id":"a","answer":"${'\\"'.repeat(1000000)}"}\n`));
  assert.equal(quotes.value.cases.length, 1);
  assert.ok(quotes.ms < allowed(5000), `took ${quotes.ms} ms`);
  const mixed = timed(() => run(`{"id":"a","answer":"${'[{'.repeat(1000000)}"}\n`));
  assert.equal(mixed.value.cases.length, 1, 'brackets inside a text are text');
});

test('a line of ten million characters that is not JSON, and ten million lines break, end with an answer', () => {
  const junk = timed(() => run(`{${'x'.repeat(10000000)}\n`));
  assert.deepEqual(junk.value.findings.map((f) => f.id), ['record-unreadable']);
  assert.ok(junk.ms < allowed(5000), `took ${junk.ms} ms`);
  const lines = timed(() => run(`{"id":"a","answer":"x"}${'\n'.repeat(5000000)}`));
  assert.equal(lines.value.cases.length, 1);
  assert.ok(lines.ms < allowed(10000), `took ${lines.ms} ms`);
});

test('a table with a cell of the longest length, one past it, a row of a million commas and a million quotes ends with an answer', () => {
  const long = 'a'.repeat(TABLE_LIMITS.maxCellLength - 20);
  const fine = timed(() => run(`id,answer,expected_facts\nq1,${long} within 30 days,within 30 days\n`));
  assert.deepEqual(fine.value.cases.map((c) => c.passed), [true]);
  assert.ok(fine.ms < allowed(10000), `took ${fine.ms} ms`);
  const over = timed(() => run(`id,answer\nq1,${'a'.repeat(TABLE_LIMITS.maxCellLength + 1)}\n`));
  assert.deepEqual(over.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.match(over.value.findings[0].message, /A cell is longer than 12000000 characters/);
  const commas = timed(() => run(`id,answer\nq${','.repeat(1000000)}\n`));
  assert.deepEqual(commas.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.match(commas.value.findings[0].message, /A row has more than 40 cells/);
  assert.ok(commas.ms < allowed(5000), `took ${commas.ms} ms`);
  const quotes = timed(() => run(`id,answer\n"${'"'.repeat(1000000)}\n`));
  assert.deepEqual(quotes.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.ok(quotes.ms < allowed(5000), `took ${quotes.ms} ms`);
  const header = timed(() => run(`${'v,'.repeat(1000000)}\n1\n`));
  assert.deepEqual(header.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.ok(header.ms < allowed(5000), `took ${header.ms} ms`);
});

test('a hundred thousand rows of a table are read in good time', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => `c${i},k${i % 7},Within 30 days,within 30 days`);
  const { value, ms } = timed(() => run(`id,category,answer,expected_facts\n${rows.join('\n')}\n`, { minPassRate: '0' }));
  assert.equal(value.cases.length, 100000);
  assert.equal(value.findings.filter((f) => f.id === 'question-empty').length, FINDING_CAP);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('an answer that cites ten thousand sources, and a hundred thousand markers, is bounded', () => {
  const urls = Array.from({ length: 20000 }, (_, i) => `https://www.example.com/p/${i}`).join(' ');
  const a = timed(() => run(jsonl([kase({ answer: `within 30 days ${urls}`, allowed_sources: ['https://www.example.com/p/*'] })]), { minPassRate: '0' }));
  assert.match(a.value.findings[0].message, /more than 10,000 distinct sources/);
  const markers = '[1] '.repeat(100000);
  const b = timed(() => run(jsonl([kase({ answer: `within 30 days ${markers}`, allowed_sources: ['doc:a'], sources: ['doc:a'] })])));
  assert.deepEqual(b.value.findings, []);
  assert.ok(a.ms < allowed(10000) && b.ms < allowed(10000), `took ${a.ms} and ${b.ms} ms`);
});

test('names that are properties of objects are only names: a category, an id and a field called __proto__ or constructor', () => {
  const text = jsonl([
    kase({ id: '__proto__', category: '__proto__' }),
    kase({ id: 'constructor', category: 'constructor' }),
    kase({ id: 'toString', category: 'toString', answer: 'Never.' }),
    '{"id":"hasOwnProperty","answer":"Within 30 days.","__proto__":{"x":1},"category":"hasOwnProperty","expected_facts":["within 30 days"],"question":"q"}'
  ]);
  const r = run(text);
  assert.deepEqual(r.categories.map((c) => [c.category, c.cases, c.passed]), [['__proto__', 1, 1], ['constructor', 1, 1], ['toString', 1, 0], ['hasOwnProperty', 1, 1]]);
  assert.equal(r.findings.filter((f) => f.id === 'field-unknown').length, 1);
  assert.equal(Object.prototype.x, undefined);
  const named = run(text, { categoryMin: ['__proto__=100', 'constructor=100'] });
  assert.equal(named.categories[0].minimum, '100');
});

test('a file of a hundred thousand cases is read from disk through the command line in good time, with an exit code', async () => {
  const lines = Array.from({ length: 100000 }, (_, i) => JSON.stringify(kase({ id: `c${i}`, category: `k${i % 50}`, answer: i % 3 ? 'Within 30 days.' : 'Never.' })));
  await withFiles({ 'cases.jsonl': `${lines.join('\n')}\n` }, async (dir) => {
    const start = process.hrtime.bigint();
    const r = await cli(['cases.jsonl', '--format', 'junit'], dir);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.equal(r.code, 1);
    assert.equal([...r.out.matchAll(/<testcase classname="k/g)].length, 100000);
    assert.ok(ms < allowed(60000), `took ${ms} ms`);
    const json = await cli(['cases.jsonl', '--json'], dir);
    assert.equal(JSON.parse(json.out).summary.evaluated, 100000);
  });
});

test('a file of ten million characters in one answer is read from disk through the command line', async () => {
  const line = JSON.stringify(kase({ answer: `within 30 days ${'x '.repeat(5000000)}` }));
  await withFiles({ 'cases.jsonl': `${line}\n` }, async (dir) => {
    const start = process.hrtime.bigint();
    const r = await cli(['cases.jsonl', '--max-chars', '20000000'], dir);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(ms < allowed(30000), `took ${ms} ms`);
  });
});
