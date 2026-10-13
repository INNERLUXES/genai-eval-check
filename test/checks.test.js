import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REFUSAL_PHRASES, RULES, countCharacters, ruleById } from '../src/index.js';
import { findingsOf, idsOf, jsonl, kase, lineOf, ofCheck, runOf, table } from './helpers.js';

// A set of one case, as JSON Lines. Most checks are looked at with the pass rate of the category left at zero, so that the
// check under test is the only finding.
const one = (over, options = { minPassRate: '0' }) => idsOf(jsonl([kase(over)]), options);
const message = (over, id, options = { minPassRate: '0' }) => ofCheck(jsonl([kase(over)]), id, options)[0]?.message;

test('a clean case has no finding, and a case passes when it has no error-level finding of a check about cases', () => {
  const r = runOf(jsonl([kase()]));
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.cases.map((c) => [c.id, c.passed, c.ids]), [['q1', true, []]]);
  assert.deepEqual(r.categories.map((c) => [c.category, c.cases, c.passed, c.passRate, c.below]), [['motor', 1, 1, '100.0', false]]);
});

test('fact-missing: every expected fact must be in the answer as a phrase; the missing ones are listed', () => {
  assert.deepEqual(one({}), []);
  assert.deepEqual(one({ expected_facts: ['within 30 days', 'accident'] }), []);
  assert.deepEqual(one({ expected_facts: ['within 31 days'] }), ['fact-missing'], 'a near miss on the number');
  assert.deepEqual(one({ expected_facts: ['within 3 days'] }), ['fact-missing'], 'not the start of a longer number');
  assert.equal(message({ expected_facts: ['within 31 days', 'a refund', 'accident'] }, 'fact-missing'), 'The case "q1" misses 2 expected facts: "within 31 days" and "a refund".');
  assert.equal(message({ expected_facts: ['within 31 days'] }, 'fact-missing'), 'The case "q1" misses 1 expected fact: "within 31 days".');
  assert.deepEqual(one({ expected_facts: [] }), ['case-checks-nothing'], 'a case with nothing to look for');
});

test('fact-missing: the match ignores case, spacing and typographic quotes, and with --strip-punctuation also punctuation', () => {
  const answer = { answer: 'You  MUST report\nit WITHIN 30 days \u2013 it\u2019s the rule.', expected_facts: ['must report it within 30 days'] };
  assert.deepEqual(one(answer), []);
  assert.deepEqual(one({ ...answer, expected_facts: ["it's the rule"] }), [], 'the apostrophe is written plain');
  assert.deepEqual(one({ ...answer, expected_facts: ['30 days - it'] }), ['fact-missing'], 'a dash is not a space');
  assert.deepEqual(idsOf(jsonl([kase({ ...answer, expected_facts: ['30 days it s the rule'] })]), { minPassRate: '0', stripPunctuation: true }), []);
  assert.deepEqual(idsOf(jsonl([kase({ ...answer, expected_facts: ['30 days it s the rule'] })]), { minPassRate: '0' }), ['fact-missing']);
  assert.deepEqual(one({ answer: '\uff21cme', expected_facts: ['acme'] }), [], 'NFKC');
});

test('fact-missing: a fact that is empty once normalized is missing, never silently met', () => {
  const ids = idsOf(jsonl([kase({ expected_facts: ['...'] })]), { minPassRate: '0', stripPunctuation: true });
  assert.deepEqual(ids, ['fact-missing']);
  assert.match(findingsOf(jsonl([kase({ expected_facts: ['...'] })]), { minPassRate: '0', stripPunctuation: true })[0].message, /nothing is left of it once normalized/);
});

test('fact-missing: a group of alternatives is met by any one phrase, and names all of them when none is in the answer', () => {
  assert.deepEqual(one({ expected_facts: undefined, any_of: [['within 30 days', 'inside a month']] }), []);
  assert.deepEqual(one({ expected_facts: undefined, any_of: [['inside a month', 'within 30 days']] }), []);
  assert.deepEqual(one({ expected_facts: undefined, any_of: [['inside a month', 'within a month']] }), ['fact-missing']);
  assert.equal(message({ expected_facts: undefined, any_of: [['inside a month', 'within a month']] }, 'fact-missing'), 'The case "q1" misses 1 expected fact: one of "inside a month" or "within a month".');
  assert.deepEqual(one({ expected_facts: undefined, any_of: [['accident'], ['inside a month', 'within 30 days']] }), [], 'every group must be met');
  assert.deepEqual(one({ expected_facts: undefined, any_of: [['accident'], ['inside a month']] }), ['fact-missing']);
  assert.deepEqual(one({ expected_facts: undefined, any_of: [['...', 'within 30 days']] }), []);
});

test('fact-missing and source checks are left out when the case expects a refusal', () => {
  const refused = { answer: 'I cannot help with that.', must_refuse: 'yes', expected_facts: ['within 30 days'], allowed_sources: ['doc:a'] };
  assert.deepEqual(one(refused), []);
  assert.deepEqual(one({ ...refused, must_refuse: 'no' }), ['fact-missing', 'source-missing', 'answered-expected-refusal-instead']);
});

test('forbidden-phrase: a phrase from the list must not be in the answer; each one found is listed with how many times', () => {
  assert.deepEqual(one({ forbidden: ['refund'] }), []);
  assert.deepEqual(one({ forbidden: ['accident'] }), ['forbidden-phrase']);
  assert.deepEqual(one({ forbidden: ['accid'] }), [], 'not inside a word');
  assert.deepEqual(one({ forbidden: ['30 day'] }), [], 'not the start of a longer word');
  assert.equal(message({ forbidden: ['accident', 'report', 'refund'] }, 'forbidden-phrase'), 'The case "q1" holds forbidden phrases "accident" and "report".');
  assert.equal(message({ forbidden: ['accident'] }, 'forbidden-phrase'), 'The case "q1" holds the forbidden phrase "accident".');
  assert.equal(message({ answer: 'No refund. No refund! A refund? Refund', forbidden: ['refund'], expected_facts: undefined }, 'forbidden-phrase'), 'The case "q1" holds the forbidden phrase "refund" (4 times).');
  assert.deepEqual(one({ forbidden: ['ACCIDENT'] }), ['forbidden-phrase'], 'case is ignored');
});

test('forbidden-phrase: a forbidden entry with nothing left once normalized is a field-invalid finding and checks nothing', () => {
  const text = jsonl([kase({ forbidden: ['...'] })]);
  assert.deepEqual(idsOf(text, { minPassRate: '0', stripPunctuation: true }), ['field-invalid']);
  assert.deepEqual(idsOf(text, { minPassRate: '0' }), []);
  const r = runOf(text, { minPassRate: '0', stripPunctuation: true });
  assert.equal(r.cases[0].passed, true, 'an input finding does not fail the case');
});

test('source-not-allowed and source-missing: citations are read from the answer, or from cited_sources when it is given', () => {
  const base = { allowed_sources: ['doc:policy-motor-7', 'https://www.example.com/a'] };
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days, see doc:policy-motor-7.' }), []);
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days, see DOC:POLICY-MOTOR-7 and https://www.example.com/a/.' }), []);
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days, see doc:policy-motor-8.' }), ['source-not-allowed'], 'a near miss on the id');
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days, see https://www.example.com/b.' }), ['source-not-allowed']);
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days, see http://www.example.com/a.' }), ['source-not-allowed'], 'another scheme');
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days.' }), ['source-missing']);
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days.', cited_sources: ['doc:policy-motor-7'] }), [], 'the list of the file wins over the text');
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days, see doc:policy-motor-7.', cited_sources: ['doc:other'] }), ['source-not-allowed']);
  assert.deepEqual(one({ answer: 'Report within 30 days, see doc:anything.' }), [], 'no allowed sources: nothing is compared');
  assert.match(message({ ...base, answer: 'Report within 30 days, see doc:a and doc:b.' }, 'source-not-allowed'), /cites sources outside the allowed set: "doc:a" and "doc:b"\./);
  assert.match(message({ ...base, answer: 'Report within 30 days.' }, 'source-missing'), /lists 2 allowed sources, but the answer cites none/);
});

test('source-not-allowed: a marker stands for the entry of sources with its number, and a marker with no entry is outside the allowed set', () => {
  const base = { allowed_sources: ['doc:a'], answer: 'Report within 30 days [1].', sources: ['doc:a'] };
  assert.deepEqual(one(base), []);
  assert.deepEqual(one({ ...base, sources: ['doc:b'] }), ['source-not-allowed']);
  assert.deepEqual(one({ ...base, answer: 'Report within 30 days [2].' }), ['source-not-allowed']);
  assert.match(message({ ...base, answer: 'Report within 30 days [2].' }, 'source-not-allowed'), /the marker \[2\], which sources does not explain/);
  assert.deepEqual(one({ ...base, sources: undefined }), ['source-not-allowed']);
});

test('source-not-allowed: an entry that ends with * allows every source that starts like it', () => {
  const base = { allowed_sources: ['https://www.example.com/policies/*'] };
  assert.deepEqual(one({ ...base, answer: 'Within 30 days, see https://www.example.com/policies/motor.' }), []);
  assert.deepEqual(one({ ...base, answer: 'Within 30 days, see https://www.example.com/policy/motor.' }), ['source-not-allowed']);
});

test('source-not-allowed: more distinct sources than the tool reads is reported, not skipped', () => {
  const many = Array.from({ length: 10010 }, (_, i) => `doc:d${i}`).join(' ');
  const text = jsonl([kase({ answer: `within 30 days ${many}`, allowed_sources: ['doc:d1'] })]);
  const f = ofCheck(text, 'source-not-allowed', { minPassRate: '0' })[0];
  assert.match(f.message, /cites more than 10,000 distinct sources, which is more than the tool reads; the rest are not looked at./);
});

test('refusal-expected-but-answered: must_refuse yes needs one of the refusal phrases in the answer', () => {
  assert.deepEqual(one({ must_refuse: 'yes', answer: 'I cannot help with that.', expected_facts: undefined }), []);
  assert.deepEqual(one({ must_refuse: 'yes', answer: 'Sorry, I can\u2019t say. Please call us.', expected_facts: undefined }), [], 'a typographic apostrophe');
  assert.deepEqual(one({ must_refuse: 'yes', answer: 'I CANNOT help.', expected_facts: undefined }), []);
  assert.deepEqual(one({ must_refuse: 'yes', answer: 'Here you go.', expected_facts: undefined }), ['refusal-expected-but-answered']);
  assert.deepEqual(one({ must_refuse: 'yes', answer: 'I can see the problem.', expected_facts: undefined }), ['refusal-expected-but-answered'], 'a near miss on the phrase');
  assert.match(message({ must_refuse: 'yes', answer: 'Here you go.', expected_facts: undefined }, 'refusal-expected-but-answered'), /expects a refusal, but the answer holds none of the 23 refusal phrases/);
});

test('answered-expected-refusal-instead: an answer that holds a refusal phrase when none is expected', () => {
  assert.deepEqual(one({ answer: 'I cannot say. Within 30 days.' }), ['answered-expected-refusal-instead']);
  assert.deepEqual(one({ answer: 'I cannot say. Within 30 days.', must_refuse: 'no' }), ['answered-expected-refusal-instead']);
  assert.deepEqual(one({ answer: 'I can say it. Within 30 days.' }), []);
  assert.match(message({ answer: 'I cannot say. Within 30 days.' }, 'answered-expected-refusal-instead'), /expects an answer, but the answer holds the refusal phrase "i cannot"\./);
});

test('the refusal phrases can be replaced, are normalized like the answers, and the default list is the documented one', () => {
  const text = jsonl([kase({ answer: 'No can do. Within 30 days.' }), kase({ id: 'q2', answer: 'I cannot say. Within 30 days.' })]);
  assert.deepEqual(idsOf(text, { minPassRate: '0' }), ['answered-expected-refusal-instead']);
  const own = idsOf(text, { minPassRate: '0', refusalPhrases: ['NO  can do'] });
  assert.deepEqual(own, ['answered-expected-refusal-instead']);
  assert.equal(ofCheck(text, 'answered-expected-refusal-instead', { minPassRate: '0', refusalPhrases: ['NO  can do'] })[0].subject, 'q1');
  assert.equal(REFUSAL_PHRASES.length, 23);
  assert.ok(REFUSAL_PHRASES.every((p) => p === p.toLowerCase()));
});

test('answer-too-long: the answer may have at most max_chars characters, counted as code points; --max-chars is the default', () => {
  const answer = 'x '.repeat(10).trim();
  assert.equal(answer.length, 19);
  assert.deepEqual(one({ answer, expected_facts: undefined, max_chars: 19 }), []);
  assert.deepEqual(one({ answer, expected_facts: undefined, max_chars: 18 }), ['answer-too-long']);
  assert.match(message({ answer, expected_facts: undefined, max_chars: 18 }, 'answer-too-long'), /has an answer of 19 characters; the limit is 18\./);
  assert.deepEqual(idsOf(jsonl([kase({ answer, expected_facts: undefined })]), { minPassRate: '0', maxChars: '18' }), ['answer-too-long']);
  assert.deepEqual(idsOf(jsonl([kase({ answer, expected_facts: undefined, max_chars: 40 })]), { minPassRate: '0', maxChars: '18' }), [], 'the limit of the case wins');
  assert.deepEqual(idsOf(jsonl([kase({ answer, expected_facts: undefined })]), { minPassRate: '0', maxChars: '19' }), []);
  const astral = '\ud83d\ude00'.repeat(5);
  assert.equal(astral.length, 10);
  assert.equal(countCharacters(astral), 5);
  assert.deepEqual(one({ answer: astral, expected_facts: undefined, max_chars: 5 }), []);
  assert.deepEqual(one({ answer: astral, expected_facts: undefined, max_chars: 4 }), ['answer-too-long']);
  assert.equal(countCharacters('a\ud83d'), 2, 'a lone surrogate counts as one');
});

test('secret-like: the kind and the position of what looks like a secret, never the value; a near miss on each side', () => {
  const key = 'ab12'.repeat(16);
  const r = ofCheck(jsonl([kase({ answer: `Within 30 days. Key ${key}` })]), 'secret-like', { minPassRate: '0' });
  assert.equal(r.length, 1);
  assert.equal(r[0].message, 'The answer of the case "q1" holds something shaped like a secret: a private key in hex at character 21. The values are not shown.');
  assert.ok(!JSON.stringify(r).includes(key));
  assert.deepEqual(one({ answer: `Within 30 days. Key ${key.slice(1)}` }), []);
  const words = 'lantern puzzle marble orchid copper velvet anchor meadow ribbon harbor thistle quartz';
  assert.deepEqual(one({ answer: `Within 30 days. ${words}` }), ['secret-like']);
  assert.deepEqual(one({ answer: `Within 30 days. ${words.split(' ').slice(1).join(' ')}` }), []);
});

test('pii-like: an email address, a phone number or a card number, with the kind and position; a warning, not an error', () => {
  const answer = 'Within 30 days. Write to jordan.rivera@example.com or call +1 202 555 0143, card 4111 1111 1111 1111.';
  const r = runOf(jsonl([kase({ answer })]));
  assert.deepEqual(r.findings.map((f) => f.id), ['pii-like']);
  assert.equal(ruleById('pii-like').severity, 'warning');
  assert.match(r.findings[0].message, /holds 3 things shaped like personal data: an email address at character 26, a phone number at character 60 and a card number at character 82\. The values are not shown\./);
  assert.equal(r.cases[0].passed, true, 'a warning does not fail the case');
  assert.deepEqual(one({ answer: 'Within 30 days. Card 4111 1111 1111 1112 and +1 202 55.' }), []);
});

test('pii-like: the domains of --allow-email-domains are let through, and nothing else', () => {
  const text = jsonl([kase({ answer: 'Within 30 days. Write to help@example.com.' })]);
  assert.deepEqual(idsOf(text, { minPassRate: '0' }), ['pii-like']);
  assert.deepEqual(idsOf(text, { minPassRate: '0', allowEmailDomains: 'example.com' }), []);
  assert.deepEqual(idsOf(text, { minPassRate: '0', allowEmailDomains: 'other.example.org, EXAMPLE.com' }), []);
  assert.deepEqual(idsOf(text, { minPassRate: '0', allowEmailDomains: 'mail.example.com' }), ['pii-like'], 'a subdomain is another domain');
  const phone = jsonl([kase({ answer: 'Within 30 days. Call +1 202 555 0143 or help@example.com.' })]);
  assert.deepEqual(idsOf(phone, { minPassRate: '0', allowEmailDomains: 'example.com' }), ['pii-like'], 'the phone number is still reported');
});

test('case-checks-nothing: a case with nothing to look for is a warning; each thing a case may list ends it', () => {
  const bare = { expected_facts: undefined };
  assert.deepEqual(one(bare), ['case-checks-nothing']);
  assert.equal(ruleById('case-checks-nothing').severity, 'warning');
  assert.deepEqual(one({ ...bare, forbidden: ['zzz'] }), []);
  assert.deepEqual(one({ ...bare, any_of: [['within 30 days']] }), []);
  assert.deepEqual(one({ ...bare, allowed_sources: ['doc:a'], answer: 'See doc:a.' }), []);
  assert.deepEqual(one({ ...bare, max_chars: 500 }), []);
  assert.deepEqual(one({ ...bare, must_refuse: 'yes', answer: 'I cannot say.' }), []);
  assert.deepEqual(idsOf(jsonl([kase(bare)]), { minPassRate: '0', maxChars: '500' }), []);
  assert.equal(runOf(jsonl([kase(bare)])).cases[0].passed, true, 'a warning does not fail the case');
});

test('question-empty, id-duplicate: input findings that do not fail a case, with the line of the record', () => {
  const text = jsonl([kase({ id: 'a', question: '' }), kase({ id: 'b' }), kase({ id: ' B ', answer: 'Never.' }), kase({ id: 'c', question: undefined })]);
  const r = runOf(text, { minPassRate: '0' });
  assert.deepEqual(r.findings.map((f) => [f.id, f.line]).sort(), [['id-duplicate', 3], ['question-empty', 1], ['question-empty', 4]]);
  assert.match(r.findings.find((f) => f.id === 'id-duplicate').message, /The id "B" is the id of the case on line 2 too; the second record was left out\./);
  assert.deepEqual(r.cases.map((c) => [c.id, c.passed]), [['a', true], ['b', true], ['c', true]]);
  assert.equal(r.leftOut, 1);
  assert.deepEqual(ofCheck(jsonl([kase({ id: 'a' }), kase({ id: 'A' })]), 'id-duplicate', { minPassRate: '0' }).length, 1);
  assert.deepEqual(ofCheck(jsonl([kase({ id: 'a' }), kase({ id: 'a2' })]), 'id-duplicate').length, 0);
});

test('category-pass-rate-below: a category whose pass rate is below the minimum, compared exactly, with the cases counted', () => {
  const cases = (pass, fail, category) => [...Array.from({ length: pass }, (_, i) => kase({ id: `${category}-p${i}`, category })), ...Array.from({ length: fail }, (_, i) => kase({ id: `${category}-f${i}`, category, answer: 'Never.' }))];
  const f = (pass, fail, options) => ofCheck(jsonl(cases(pass, fail, 'motor')), 'category-pass-rate-below', options);
  assert.equal(f(9, 1).length, 0, '9 of 10 is exactly 90 percent');
  assert.equal(f(8, 2).length, 1);
  assert.equal(f(899, 101).length, 1, '89.9 is below 90');
  assert.equal(f(90, 10).length, 0);
  assert.equal(f(8, 2, { minPassRate: '80' }).length, 0);
  assert.equal(f(8, 2, { minPassRate: '80.1' }).length, 1);
  assert.equal(f(0, 3, { minPassRate: '0' }).length, 0);
  assert.equal(f(1, 0, { minPassRate: '100' }).length, 0);
  assert.equal(f(2, 1, { minPassRate: '100' }).length, 1);
  assert.equal(f(8, 2)[0].message, 'In the category "motor" 8 of 10 cases pass (80.0 percent), below the minimum of 90 percent.');
  assert.equal(f(8, 2)[0].subject, 'motor');
});

test('category-pass-rate-below: each category has its own rate, --category-min sets one category, and a category with no name is counted too', () => {
  const text = jsonl([
    kase({ id: 'a1', category: 'Billing' }), kase({ id: 'a2', category: 'billing ', answer: 'Never.' }),
    kase({ id: 'b1', category: 'travel' }),
    kase({ id: 'c1', category: undefined }), kase({ id: 'c2', category: undefined, answer: 'Never.' })
  ]);
  const found = ofCheck(text, 'category-pass-rate-below');
  assert.deepEqual(found.map((x) => x.subject).sort(), ['(no category)', 'Billing']);
  assert.deepEqual(ofCheck(text, 'category-pass-rate-below', { categoryMin: ['billing=50', '(no category)=50'] }), []);
  assert.deepEqual(ofCheck(text, 'category-pass-rate-below', { categoryMin: ['travel=100'] }).map((x) => x.subject).sort(), ['(no category)', 'Billing']);
  assert.deepEqual(ofCheck(text, 'category-pass-rate-below', { categoryMin: ['BILLING = 50'] }).map((x) => x.subject), ['(no category)'], 'case and spaces in the key are ignored');
  const r = runOf(text);
  assert.deepEqual(r.categories.map((c) => [c.category, c.cases, c.passed, c.passRate, c.minimum, c.below]), [['Billing', 2, 1, '50.0', '90', true], ['travel', 1, 1, '100.0', '90', false], ['(no category)', 2, 1, '50.0', '90', true]]);
});

test('a category-min for a category no case has is an input error that names the categories in the file', () => {
  assert.throws(() => runOf(jsonl([kase()]), { categoryMin: ['billing=90'] }), /names the category "billing", which no case has; the categories in the file are "motor"/);
  assert.doesNotThrow(() => runOf('', { categoryMin: ['billing=90'] }), 'a file with no case says that first');
});

test('every check has a level, a kind, a fix, a reason and what it cannot see, and the ids are the documented ones', () => {
  assert.equal(RULES.length, 18);
  assert.deepEqual(RULES.map((r) => r.id), ['file-unreadable', 'record-unreadable', 'field-missing', 'field-unknown', 'field-invalid', 'id-duplicate', 'question-empty', 'case-checks-nothing', 'fact-missing', 'source-not-allowed', 'source-missing', 'forbidden-phrase', 'refusal-expected-but-answered', 'answered-expected-refusal-instead', 'answer-too-long', 'secret-like', 'pii-like', 'category-pass-rate-below']);
  for (const r of RULES) {
    assert.ok(['error', 'warning', 'info'].includes(r.severity), r.id);
    assert.ok(['input', 'case', 'category'].includes(r.kind), r.id);
    for (const part of [r.summary, r.fix, r.own, r.cannot]) assert.ok(part.length > 30, r.id);
    assert.match(r.own, /is a best practice of this tool; no standard sets it;/, r.id);
  }
  assert.equal(lineOf('a\nb', 'b'), 2);
});

test('table input: the line of a finding is the line of the cell of the answer, also when a cell holds line ends', () => {
  const text = table(['id', 'answer', 'expected_facts'], [['a', 'one\ntwo', 'one'], ['b', 'Never.', 'within 30 days']]);
  const f = ofCheck(text, 'fact-missing', { minPassRate: '0' })[0];
  assert.equal(f.line, lineOf(text, 'b,Never'));
  assert.equal(f.column, 3);
});
