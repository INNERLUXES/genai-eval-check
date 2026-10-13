import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEST, DEFAULTS, FIELDS, FIELD_NAMES, FINDING_CAP, KINDS, LEVELS, NOT_A, NOTICE, NO_CATEGORY, REFUSAL_PHRASES, RULES, WORK_LIMITS, atOrAbove, createCollector, decide, editDistance, flat, grouped, list, listText, nameKey, nearest, normalizeName, parseCategoryMin, parseDomains, plural, readOptions, safeText, show } from '../src/index.js';

test('safeText: control, line separator and direction characters become a space, and the length is capped', () => {
  assert.equal(safeText('a\u001b[31mb\u202ec\u2028d\u0085e'), 'a [31mb c d e');
  assert.equal(safeText('x'.repeat(400)).length, 300);
  assert.ok(safeText('x'.repeat(400)).endsWith('...'));
  assert.equal(safeText('abc', 10), 'abc');
  assert.equal(flat('  a \n b\t c  '), 'a b c');
});

test('grouped, plural and listText: numbers and lists as the reports show them', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'case'), '1 case');
  assert.equal(plural(2, 'case'), '2 cases');
  assert.equal(plural(1, 'category', 'categories'), '1 category');
  assert.equal(plural(1500, 'record'), '1,500 records');
  assert.equal(listText([]), '');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e']), 'a, b, c and 2 more');
});

test('list, show and nameKey: a list for a sentence, text from the input cut short, and names compared without case or extra space', () => {
  assert.equal(list([]), '');
  assert.equal(list(['a']), 'a');
  assert.equal(list(['a', 'b']), 'a and b');
  assert.equal(list(['a', 'b', 'c']), 'a, b and c');
  assert.equal(list(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(show('x'.repeat(100)).length, 60);
  assert.equal(nameKey('  Billing \n Team '), 'billing team');
  assert.equal(nameKey('\uff22illing'), 'billing');
});

test('createCollector: the first FINDING_CAP findings of a check are kept and the rest are counted', () => {
  const c = createCollector();
  for (let i = 0; i < FINDING_CAP + 3; i += 1) c.add('fact-missing', { line: i + 1, column: 1 }, 'm', 'q');
  c.add('forbidden-phrase', { line: 1, column: 1, caseIndex: 4 }, 'm');
  assert.equal(c.findings.filter((f) => f.id === 'fact-missing').length, FINDING_CAP);
  assert.equal(c.omitted.get('fact-missing'), 3);
  assert.equal(c.omitted.has('forbidden-phrase'), false);
  assert.deepEqual([c.findings.at(-1).caseIndex, c.findings.at(-1).subject], [4, null]);
});

test('the fields: names, types and what is needed', () => {
  assert.deepEqual(FIELD_NAMES, ['id', 'category', 'question', 'answer', 'expected_facts', 'any_of', 'forbidden', 'allowed_sources', 'cited_sources', 'sources', 'must_refuse', 'max_chars', 'note']);
  assert.deepEqual(FIELDS.filter((f) => f.needed).map((f) => f.name), ['id', 'answer']);
  assert.ok(FIELDS.every((f) => f.summary.length > 10));
  assert.equal(normalizeName(' Expected-Facts '), 'expected_facts');
  assert.equal(normalizeName('__x__'), 'x');
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(nearest('expected_fact', FIELD_NAMES), 'expected_facts');
  assert.equal(nearest('zebra', FIELD_NAMES), null);
});

test('the data: levels, kinds, the notice, the default and the limits', () => {
  assert.deepEqual(LEVELS, ['info', 'warning', 'error']);
  assert.deepEqual(KINDS, ['input', 'case', 'category']);
  assert.equal(DEFAULTS.minPassRate, '90');
  assert.equal(NO_CATEGORY, '(no category)');
  assert.ok(NOTICE.includes('deterministic string checking'));
  assert.ok(NOTICE.includes('never calls a model'));
  assert.ok(NOTICE.includes('not a full evaluation of a model'));
  assert.ok(NOT_A.includes('never calls a model'));
  assert.ok(BEST.includes('no standard sets it'));
  assert.equal(REFUSAL_PHRASES.length, 23);
  assert.deepEqual(Object.keys(WORK_LIMITS).sort(), ['maxCases', 'maxCitations', 'maxFieldChars', 'maxJsonDepth', 'maxKeys', 'maxListEntries', 'maxMarks', 'maxPhraseChars', 'maxWork']);
  assert.equal(RULES.length, 18);
});

test('atOrAbove and decide: pass unless a finding is at or above the fail-on level', () => {
  assert.equal(atOrAbove('error', 'warning'), true);
  assert.equal(atOrAbove('info', 'warning'), false);
  assert.deepEqual(decide({ error: 0, warning: 0, info: 0 }, 'error'), { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' });
  assert.equal(decide({ error: 0, warning: 2, info: 1 }, 'error').text, 'PASS - no finding at or above error (2 warning, 1 info)');
  assert.equal(decide({ error: 1, warning: 0, info: 0 }, 'error').text, 'FAIL - 1 finding at or above error (1 error)');
  assert.equal(decide({ error: 1, warning: 2, info: 0 }, 'warning').text, 'FAIL - 3 findings at or above warning (1 error, 2 warning)');
  assert.equal(decide({ error: 0, warning: 0, info: 1 }, 'info').pass, false);
});

test('parseCategoryMin and parseDomains: the texts of the options, and null for what is not one', () => {
  assert.equal(parseCategoryMin('billing=95').key, 'billing');
  assert.equal(parseCategoryMin('a = b = 7.5').key, 'a = b');
  assert.equal(parseCategoryMin('billing=95').percent.text, '95');
  for (const bad of ['billing', '=95', 'billing=', 'billing=abc', 'billing=101', ' =5']) assert.equal(parseCategoryMin(bad), null, bad);
  assert.deepEqual(parseDomains('example.com'), ['example.com']);
  assert.deepEqual(parseDomains(' Example.COM , mail.example.org '), ['example.com', 'mail.example.org']);
  for (const bad of ['example', 'a b.com', 'example.com,', '', '@example.com', 'a..b']) assert.equal(parseDomains(bad), null, bad);
});

test('readOptions: defaults, the values given, and an Error that names the option for a value it cannot use', () => {
  const o = readOptions();
  assert.equal(o.minPassRate.text, '90');
  assert.equal(o.stripPunctuation, false);
  assert.equal(o.refusalDefault, true);
  assert.equal(o.refusalPhrases, REFUSAL_PHRASES);
  assert.equal(o.maxChars, null);
  assert.equal(o.allowDomains.size, 0);
  const own = readOptions({ minPassRate: '75.5', categoryMin: ['A=1'], stripPunctuation: true, refusalPhrases: ['no'], maxChars: '300', allowEmailDomains: 'example.com' });
  assert.deepEqual([own.minPassRate.text, own.categoryMin.get('a').percent.text, own.stripPunctuation, own.refusalDefault, own.maxChars, [...own.allowDomains]], ['75.5', '1', true, false, 300, ['example.com']]);
  assert.throws(() => readOptions({ minPassRate: '101' }), /--min-pass-rate: 101 is not a plain number of percent/);
  assert.throws(() => readOptions({ categoryMin: ['x'] }), /--category-min: x is not category=percent/);
  assert.throws(() => readOptions({ maxChars: '1e3' }), /--max-chars: 1e3 is not a whole number/);
  assert.throws(() => readOptions({ allowEmailDomains: 'x' }), /--allow-email-domains: x is not/);
});
