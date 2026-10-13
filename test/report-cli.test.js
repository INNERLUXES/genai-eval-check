import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULTS, RULES, USAGE, VERSION, buildReport, checkText, displayPath, parseArgs, readOptions, toJunit } from '../src/index.js';
import { ARGS, BAD, GOOD, cli, jsonl, kase, run, withFiles } from './helpers.js';

const json = async (files, args) => JSON.parse((await run(files, [...ARGS, '--json', ...args])).out);

// A file with every kind of finding, for the formats: a failing case, a warning, an input error and a failing category.
const MIXED = {
  'cases.jsonl': jsonl([
    kase({ id: 'a', answer: 'Never.' }),
    kase({ id: 'b', answer: 'Within 30 days. Write to help@example.com.' }),
    kase({ id: 'c', category: 'travel' }),
    '{"id":"d"'
  ])
};

test('exit codes: 0 for a pass, 1 for a finding at or above --fail-on, 2 for a usage or input error', async () => {
  assert.equal((await run(GOOD, ARGS)).code, 0);
  assert.equal((await run(BAD, ARGS)).code, 1);
  assert.equal((await run(GOOD, ['nope.jsonl'])).code, 2);
  assert.equal((await run(GOOD, [])).code, 2);
  const warn = { 'cases.jsonl': jsonl([kase({ answer: 'Within 30 days. Write to help@example.com.' })]) };
  assert.equal((await run(warn, ARGS)).code, 0, 'a warning does not fail the default run');
  assert.equal((await run(warn, [...ARGS, '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(warn, [...ARGS, '--fail-on', 'info'])).code, 1);
  assert.equal((await run(GOOD, [...ARGS, '--fail-on', 'info'])).code, 0);
});

test('a run fails on the pass rate of a category and passes when the minimum is lowered or set per category', async () => {
  const files = { 'cases.jsonl': jsonl([kase({ id: 'a' }), kase({ id: 'b' }), kase({ id: 'c', answer: 'Never.' })]) };
  const strict = await run(files, ARGS);
  assert.equal(strict.code, 1);
  assert.match(strict.out, /In the category "motor" 2 of 3 cases pass \(66\.7 percent\), below the minimum of 90 percent\./);
  assert.equal((await run(files, [...ARGS, '--min-pass-rate', '66.6'])).code, 1, 'the failing case is an error of its own');
  const r = await run(files, [...ARGS, '--min-pass-rate', '66.6', '--min-severity', 'info', '--json']);
  assert.ok(!JSON.parse(r.out).findings.some((f) => f.id === 'category-pass-rate-below'));
  const own = JSON.parse((await run(files, [...ARGS, '--min-pass-rate', '100', '--category-min', 'motor=66.6', '--json'])).out);
  assert.ok(!own.findings.some((f) => f.id === 'category-pass-rate-below'));
  assert.deepEqual(own.options.categoryMin, ['motor=66.6']);
});

test('--min-severity hides findings below the level but they still count for the result and are counted in the totals', async () => {
  const all = await json(MIXED, []);
  const errors = await json(MIXED, ['--min-severity', 'error']);
  assert.ok(all.totals.findings > errors.totals.findings);
  assert.equal(errors.findings.every((f) => f.severity === 'error'), true);
  assert.equal(errors.totals.hidden, all.totals.findings - errors.totals.findings);
  const text = (await run(MIXED, [...ARGS, '--min-severity', 'error', '--fail-on', 'warning'])).out;
  assert.match(text, /below error not shown/);
  assert.match(text, /RESULT: FAIL/);
});

test('--list-checks: text, markdown and JSON, with every check, and no SARIF or JUnit form', async () => {
  const text = (await cli(['--list-checks'], process.cwd())).out;
  for (const r of RULES) assert.ok(text.includes(r.id), r.id);
  assert.match(text, /a best practice of this tool; no standard sets it/);
  const md = (await cli(['--list-checks', '--format', 'markdown'], process.cwd())).out;
  assert.match(md, /^# genai-eval-check checks\n\n\| Check \| Level \| Kind \| What it looks at \|/);
  const j = JSON.parse((await cli(['--list-checks', '--json'], process.cwd())).out);
  assert.deepEqual(j.map((x) => x.id), RULES.map((r) => r.id));
  assert.ok(j.every((x) => x.cannot && x.fix && x.own));
  const sarif = await cli(['--list-checks', '--format', 'sarif'], process.cwd());
  assert.equal(sarif.code, 2);
  assert.match(sarif.err, /--list-checks has no SARIF form/);
  const junit = await cli(['--explain', 'fact-missing', '--format', 'junit'], process.cwd());
  assert.equal(junit.code, 2);
  assert.match(junit.err, /--explain has no JUNIT form/);
});

test('--explain <id>: what it looks at, why, what to change, what it cannot see, in three formats; a misspelt id gets a suggestion', async () => {
  for (const r of RULES) {
    const text = await cli(['--explain', r.id], process.cwd());
    assert.equal(text.code, 0, r.id);
    assert.ok(text.out.startsWith(`${r.id}\n`), r.id);
    for (const part of ['what it looks at:', 'why it exists:', 'what to change:', 'what it cannot see:', `level: ${r.severity}`]) assert.ok(text.out.includes(part), `${r.id} ${part}`);
  }
  const md = (await cli(['--explain', 'fact-missing', '--format', 'markdown'], process.cwd())).out;
  assert.match(md, /^# fact-missing\n\n- Level: error\n- Kind: case\n\n\*\*What it looks at\.\*\*/);
  const j = JSON.parse((await cli(['--explain', 'fact-missing', '--json'], process.cwd())).out);
  assert.equal(j.id, 'fact-missing');
  assert.equal(j.severity, 'error');
  const typo = await cli(['--explain', 'fact-mising'], process.cwd());
  assert.equal(typo.code, 2);
  assert.match(typo.err, /unknown check fact-mising\. Did you mean fact-missing\?/);
  const far = await cli(['--explain', 'completely-different-words-here'], process.cwd());
  assert.doesNotMatch(far.err, /Did you mean/);
});

test('--help and --version print and exit with 0, and the usage lists every option and every check', async () => {
  const help = await cli(['--help'], process.cwd());
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const option of ['--format', '--json', '--min-severity', '--fail-on', '--min-pass-rate', '--category-min', '--strip-punctuation', '--refusal-phrases', '--max-chars', '--allow-email-domains', '--list-checks', '--explain', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  for (const r of RULES) assert.ok(USAGE.includes(r.id), r.id);
  const version = await cli(['--version'], process.cwd());
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(DEFAULTS.minPassRate, '90');
});

test('usage errors are exit code 2, with the message and the usage on standard error and nothing on standard output', async () => {
  const bad = [
    [['--bogus'], /unknown argument --bogus/],
    [['cases.jsonl', 'second.jsonl'], /give one cases file/],
    [[], /give the cases file/],
    [['cases.jsonl', '--format'], /--format needs a value/],
    [['cases.jsonl', '--format', '--json'], /--format needs a value/],
    [['cases.jsonl', '--format', 'pdf'], /unknown format pdf \(text, markdown, json, sarif or junit\)/],
    [['cases.jsonl', '--json', '--format', 'sarif'], /--json and --format sarif ask for two formats/],
    [['cases.jsonl', '--format', 'text', '--format', 'json'], /--format was given twice/],
    [['cases.jsonl', '--fail-on', 'fatal'], /--fail-on: unknown level fatal/],
    [['cases.jsonl', '--min-severity', 'loud'], /--min-severity: unknown level loud/],
    [['cases.jsonl', '--min-pass-rate', '120'], /--min-pass-rate: 120 is not a plain number of percent from 0 to 100/],
    [['cases.jsonl', '--min-pass-rate', 'ninety'], /--min-pass-rate: ninety is not/],
    [['cases.jsonl', '--category-min', 'billing'], /--category-min: billing is not category=percent/],
    [['cases.jsonl', '--category-min', 'billing=101'], /--category-min: billing=101 is not category=percent/],
    [['cases.jsonl', '--category-min', '=90'], /is not category=percent/],
    [['cases.jsonl', '--category-min', 'a=90', '--category-min', 'A=80'], /the category A was given twice/],
    [['cases.jsonl', '--max-chars', '0'], /--max-chars: 0 is not a whole number/],
    [['cases.jsonl', '--max-chars', '12.5'], /--max-chars: 12\.5 is not a whole number/],
    [['cases.jsonl', '--allow-email-domains', 'not a domain'], /--allow-email-domains: not a domain is not a comma separated list of domains/],
    [['cases.jsonl', '--allow-email-domains', 'example'], /is not a comma separated list of domains/],
    [['-'], /reading from standard input is not supported/],
    [['cases.jsonl', '--refusal-phrases', '-'], /reading from standard input is not supported/],
    [['https://example.com/cases.jsonl'], /give a local path; the tool never fetches a URL/],
    [['cases.jsonl', '--refusal-phrases', 'https://example.com/r.txt'], /give a local path/],
    [['cases.jsonl', '--explain', 'nope'], /unknown check nope/]
  ];
  for (const [args, pattern] of bad) {
    const r = await cli(args, process.cwd());
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.out, '', args.join(' '));
    assert.match(r.err, pattern, args.join(' '));
    assert.match(r.err, /Usage: genai-eval-check/, args.join(' '));
  }
  assert.doesNotThrow(() => parseArgs(['--category-min', 'a=1', '--category-min', 'b=2', '--help']));
});

test('text report: what was read, the categories, the checks, each finding with its place and its fix, the notice and the result', async () => {
  const r = await run(MIXED, ARGS);
  assert.equal(r.code, 1);
  assert.match(r.out, /^genai-eval-check: cases\.jsonl\nfile: cases\.jsonl \(JSONL, 4 lines, \d+ bytes\)\n/);
  assert.match(r.out, /\nrecords: 4 \(3 evaluated, 1 record left out\)\n/);
  assert.match(r.out, /\ncases: 3 evaluated, 2 pass, 1 fail; pass rate 66\.7 percent\n/);
  assert.match(r.out, /\nsettings: minimum pass rate 90 percent; punctuation kept; refusal phrases: default list\n/);
  assert.match(r.out, /\n {2}ERROR {4}fact-missing +cases\.jsonl:1\n {11}The case "a" misses 1 expected fact: "within 30 days"\.\n {11}fix: /);
  assert.match(r.out, /\n {2}WARNING {2}pii-like +cases\.jsonl:2\n/);
  assert.match(r.out, /\n {2}ERROR {4}record-unreadable +cases\.jsonl:4\n/);
  assert.match(r.out, /\nChecks \(18\)\n/);
  assert.match(r.out, /\nRESULT: FAIL - \d+ findings? at or above error \(/);
  assert.ok(r.out.endsWith('\n'));
});

test('text report: settings that were set are shown, and the report of a file with no case says so', async () => {
  const r = await run(GOOD, [...ARGS, '--strip-punctuation', '--max-chars', '1200', '--allow-email-domains', 'example.com,example.org', '--category-min', 'motor=100']);
  assert.match(r.out, /\nsettings: minimum pass rate 90 percent; category minimums motor=100; punctuation stripped; refusal phrases: default list; longest answer 1,200 characters; email domains allowed: example\.com, example\.org\n/);
});

test('markdown report: a table of categories and of findings, with what markdown gives a meaning to escaped', async () => {
  const files = { 'cases.jsonl': jsonl([kase({ id: 'a|b', category: 'x*y', answer: 'Never <b>so</b> [link](https://example.com).', expected_facts: ['within `30` days'] })]) };
  const out = (await run(files, [...ARGS, '--format', 'markdown'])).out;
  assert.match(out, /^# genai-eval-check: cases\.jsonl\n\n- File: /);
  assert.match(out, /\n## Categories\n\n\| Category \| Cases \| Pass \| Fail \| Pass rate \| Minimum \|\n\| --- \|/);
  assert.match(out, /\| x\\\*y \| 1 \| 0 \| 1 \| 0\.0% \| 90% \\\(below\\\) \|/);
  assert.match(out, /\| error \| fact-missing \| cases\.jsonl:1 \| The case "a\\\|b" misses 1 expected fact: "within \\`30\\` days"\./);
  assert.doesNotMatch(out, /<b>/);
  assert.match(out, /- Result: \*\*FAIL/);
  const clean = (await run(GOOD, [...ARGS, '--format', 'markdown'])).out;
  assert.match(clean, /\n## Findings\n\nNone\.\n/);
});

test('JSON report: the file, the summary, every case, every check with its count, every finding with its place, the options and the result', async () => {
  const r = await json(MIXED, []);
  assert.equal(r.tool, 'genai-eval-check');
  assert.equal(r.version, VERSION);
  assert.deepEqual(Object.keys(r), ['tool', 'version', 'input', 'summary', 'cases', 'totals', 'rules', 'options', 'findings', 'notes', 'notice', 'result']);
  assert.deepEqual(r.input, { file: 'cases.jsonl', format: 'JSONL', bytes: r.input.bytes, lines: 4 });
  assert.deepEqual([r.summary.records, r.summary.evaluated, r.summary.leftOut, r.summary.passed, r.summary.failed, r.summary.passRate], [4, 3, 1, 2, 1, '66.7']);
  assert.deepEqual(r.cases.map((c) => [c.id, c.category, c.line, c.passed, c.findings]), [['a', 'motor', 1, false, ['fact-missing']], ['b', 'motor', 2, true, ['pii-like']], ['c', 'travel', 3, true, []]]);
  assert.equal(r.rules.length, 18);
  assert.equal(r.rules.find((x) => x.id === 'pii-like').findings, 1);
  const f = r.findings.find((x) => x.id === 'fact-missing');
  assert.deepEqual([f.severity, f.kind, f.file, f.line, f.column, f.at, f.caseId, f.caseIndex, f.subject], ['error', 'case', 'cases.jsonl', 1, 1, 'cases.jsonl:1', 'a', 0, 'a']);
  assert.ok(f.fix.length > 10);
  assert.equal(r.result.pass, false);
  assert.deepEqual(r.options, { minSeverity: 'info', failOn: 'error', minPassRate: '90', categoryMin: [], stripPunctuation: false, maxChars: null, refusalPhrases: 'default list', allowEmailDomains: [] });
});

test('SARIF report: the checks as rules, one result for each finding with its line and column, and levels error, warning and note', async () => {
  const sarif = JSON.parse((await run(MIXED, [...ARGS, '--format', 'sarif'])).out);
  assert.equal(sarif.version, '2.1.0');
  const [run1] = sarif.runs;
  assert.equal(run1.tool.driver.name, 'genai-eval-check');
  assert.deepEqual(run1.tool.driver.rules.map((x) => x.id), RULES.map((x) => x.id));
  assert.deepEqual(run1.artifacts, [{ location: { uri: 'cases.jsonl' } }]);
  const result = run1.results.find((x) => x.ruleId === 'fact-missing');
  assert.equal(result.level, 'error');
  assert.equal(result.ruleIndex, RULES.findIndex((x) => x.id === 'fact-missing'));
  assert.deepEqual(result.locations[0].physicalLocation.region, { startLine: 1, startColumn: 1 });
  assert.equal(result.locations[0].physicalLocation.artifactLocation.uri, 'cases.jsonl');
  assert.equal(result.properties.caseId, 'a');
  assert.equal(run1.results.find((x) => x.ruleId === 'pii-like').level, 'warning');
  assert.equal(run1.tool.driver.rules.find((x) => x.id === 'case-checks-nothing').defaultConfiguration.level, 'warning');
  assert.match(run1.properties.result, /^FAIL/);
});

test('JUnit report: a suite for each category with a test for each case, failures with their findings, a suite for the input and one for the pass rates', async () => {
  const xml = (await run(MIXED, [...ARGS, '--format', 'junit'])).out;
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="genai-eval-check" tests="6" failures="2" errors="1" time="0">\n'));
  assert.match(xml, /<testsuite name="motor" tests="2" failures="1" errors="0" skipped="0" time="0">/);
  assert.match(xml, /<testcase classname="motor" name="a" file="cases\.jsonl" line="1" time="0">\n {6}<failure type="fact-missing" message="fact-missing">fact-missing: The case &quot;a&quot; misses 1 expected fact: &quot;within 30 days&quot;\.<\/failure>\n {4}<\/testcase>/);
  assert.match(xml, /<testcase classname="motor" name="b" file="cases\.jsonl" line="2" time="0">\n {6}<system-out>warning pii-like: /);
  assert.match(xml, /<testcase classname="travel" name="c" file="cases\.jsonl" line="3" time="0"\/>/);
  assert.match(xml, /<testsuite name="input" tests="1" failures="0" errors="1" skipped="0" time="0">\n {4}<testcase classname="input" name="record-unreadable at line 4" file="cases\.jsonl" line="4" time="0">\n {6}<error type="record-unreadable" message="The line is not valid JSON/);
  assert.match(xml, /<testsuite name="categories" tests="2" failures="1" errors="0" skipped="0" time="0">/);
  assert.match(xml, /<testcase classname="categories" name="pass rate of motor" time="0">\n {6}<failure type="category-pass-rate-below" message="1 of 2 cases pass \(50\.0 percent\), below the minimum of 90 percent">/);
  assert.match(xml, /<testcase classname="categories" name="pass rate of travel" time="0"\/>/);
  assert.ok(xml.endsWith('</testsuites>\n'));
  assert.equal([...xml.matchAll(/<testcase /g)].length, 6);
});

test('JUnit report: a file with no finding has only passing tests, and a case with no category is in a suite of its own name', async () => {
  const xml = (await run({ 'cases.jsonl': jsonl([kase({ category: undefined })]) }, [...ARGS, '--format', 'junit'])).out;
  assert.match(xml, /<testsuites name="genai-eval-check" tests="2" failures="0" errors="0" time="0">/);
  assert.match(xml, /<testsuite name="\(no category\)" tests="1" failures="0"/);
  assert.doesNotMatch(xml, /<failure|<error/);
});

test('JUnit report: categories that differ only in case or spacing are one suite, and every case is a test in it', async () => {
  const files = { 'cases.jsonl': jsonl([kase({ id: 'a', category: 'Billing' }), kase({ id: 'b', category: 'billing ' }), kase({ id: 'c', category: ' BILLING', answer: 'Never.' })]) };
  const xml = (await run(files, [...ARGS, '--format', 'junit'])).out;
  assert.equal([...xml.matchAll(/<testsuite name=/g)].length, 2, 'the category and the pass rates');
  assert.match(xml, /<testsuite name="Billing" tests="3" failures="1"/);
  assert.equal([...xml.matchAll(/<testcase classname="[^"]*" name="[abc]"/g)].length, 3);
});

test('JUnit report: XML is escaped, control characters and lone surrogates cannot get in, and a case that fails only by a rule it cannot list still fails', async () => {
  const files = { 'cases.jsonl': jsonl([kase({ id: 'a<&>"\'\u0007\ud800', category: 'c&d', answer: 'x', expected_facts: ['y'] })]) };
  const xml = (await run(files, [...ARGS, '--format', 'junit'])).out;
  assert.doesNotMatch(xml, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  assert.match(xml, /name="a&lt;&amp;&gt;&quot;&apos; \?"/);
  assert.match(xml, /classname="c&amp;d"/);
  assert.equal([...xml].some((c) => c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff), false);
  const report = buildReport({ file: { file: 'c.jsonl', bytes: 1, lines: 1 }, checked: checkText(jsonl([kase({ answer: 'Never.' })]), { options: readOptions({ minPassRate: '0' }) }), version: '0', minSeverity: 'error' });
  report.findings = [];
  assert.match(toJunit(report), /<failure type="fact-missing" message="fact-missing">fact-missing<\/failure>/);
});

test('text from the input cannot rewrite the terminal: control, line separator and direction characters are replaced in every format', async () => {
  const evil = 'a\u001b[31mred\u202ebidi\u2028line\u0085';
  const files = { 'cases.jsonl': jsonl([kase({ id: evil, category: evil, answer: 'Never.' })]) };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const out = (await run(files, [...ARGS, '--format', format])).out;
    assert.doesNotMatch(out, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2028\u2029]/, format);
    assert.ok(out.includes('red'), format);
  }
  // Windows refuses a control character in a file name, so the name is tried where the system allows it, and the shown
  // form of any path is cleaned where the path is built.
  if (process.platform !== 'win32') {
    const named = await run({ 'case\u0001s.jsonl': jsonl([kase()]) }, ['case\u0001s.jsonl']);
    assert.doesNotMatch(named.out, /\u0001/);
  }
  assert.equal(displayPath(resolve('/work/a\u001b[31mb.jsonl'), resolve('/work')), 'a [31mb.jsonl');
});

test('the secrets and personal data of an answer are never in any format, only their kind and position', async () => {
  const hex = 'ab12'.repeat(16);
  const files = { 'cases.jsonl': jsonl([kase({ answer: `Within 30 days. key ${hex} mail jordan.rivera@example.com card 4111 1111 1111 1111 call +1 202 555 0143` })]) };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const out = (await run(files, [...ARGS, '--format', format])).out;
    for (const value of [hex, 'jordan.rivera', '4111 1111', '555 0143']) assert.ok(!out.includes(value), `${format}: ${value}`);
    assert.ok(out.includes('private key in hex'), format);
  }
});

test('a run writes nothing: the folder holds the same files after it, and standard error stays empty on a report', async () => {
  await withFiles(MIXED, async (dir) => {
    const before = (await readdir(dir)).sort();
    for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
      const r = await cli(['cases.jsonl', '--format', format], dir);
      assert.equal(r.err, '', format);
    }
    assert.deepEqual((await readdir(dir)).sort(), before);
  });
});

test('the same input and options give the same report every time, whatever the order of the options', async () => {
  const a = await run(MIXED, [...ARGS, '--min-pass-rate', '50', '--fail-on', 'warning', '--format', 'json']);
  const b = await run(MIXED, ['--format', 'json', '--fail-on', 'warning', '--min-pass-rate', '50', ...ARGS]);
  assert.equal(a.out, b.out);
  assert.equal((await run(MIXED, ARGS)).out, (await run(MIXED, ARGS)).out);
});

test('findings of one check are kept up to the cap and the rest are counted and noted, in the totals and the checks table', async () => {
  const cases = Array.from({ length: 1005 }, (_, i) => kase({ id: `c${i}`, answer: 'Never.' }));
  const r = await json({ 'cases.jsonl': jsonl(cases) }, ['--min-pass-rate', '0']);
  assert.equal(r.findings.filter((f) => f.id === 'fact-missing').length, 1000);
  assert.equal(r.rules.find((x) => x.id === 'fact-missing').findings, 1005);
  assert.equal(r.totals.findings, 1005);
  assert.ok(r.notes.includes('5 more findings of fact-missing are not listed; the first 1,000 are'));
  assert.equal(r.summary.failed, 1005, 'every case is counted, whatever the cap');
});
