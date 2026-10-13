// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// evaluation sets to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Every path is relative to the root of the repository.
export const BAD = ['examples/bad/cases.jsonl'];
export const GOOD = ['examples/good/cases.jsonl'];
export const EXPLAIN = ['--explain', 'fact-missing'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad evaluation set: the counts, a finding of every check but one, and the result.
export const EXPECTED = [
  'records: 22 (15 evaluated, 7 records left out)',
  'cases: 15 evaluated, 7 pass, 8 fail; pass rate 46.7 percent',
  'findings: 27 (24 error, 3 warning)',
  'The line is not valid JSON (near character 114); the record was left out.',
  'The line is a list, and every line of a JSON Lines file is an object; the record was left out.',
  'The record is nested deeper than 4 levels, which no case needs; it was not parsed and was left out.',
  'The record has no "id", which every case needs; the record was left out.',
  'The case "home-005" has no "answer" (an empty answer is a missing one); the record was left out.',
  'The field "expected_fact" is not a field the tool reads; did you mean "expected_facts"? Nothing under it is checked.',
  'The field "must_refuse" is "maybe", and must_refuse is yes, no or empty; the record was left out.',
  'The field "max_chars" is "ten", and max_chars is a whole number from 1 to 100,000,000; the record was left out.',
  'The id "MOTOR-001" is the id of the case on line 1 too; the second record was left out.',
  'The case "claims-003" has no question.',
  'The case "general-001" lists no expected fact, no alternatives, no forbidden phrase, no allowed source, no limit and no required refusal',
  'The case "motor-002" misses 2 expected facts: "standard excess is 250" and "windscreen".',
  'The case "motor-003" misses 1 expected fact: one of "subject to the policy terms" or "subject to the terms of your policy".',
  'The case "motor-003" holds the forbidden phrase "guaranteed payout".',
  'The case "home-001" cites sources outside the allowed set: "https://www.example.com/blog/flood-tips", "doc:policy-travel-2" and the marker [4], which sources does not explain.',
  'The case "home-002" lists 1 allowed source, but the answer cites none.',
  'The case "travel-001" expects a refusal, but the answer holds none of the 23 refusal phrases.',
  'The case "travel-002" expects an answer, but the answer holds the refusal phrase "i cannot".',
  'The case "travel-003" has an answer of 137 characters; the limit is 60.',
  'The answer of the case "claims-001" holds 2 things shaped like a secret: a seed phrase at character 46 and a private key in hex at character 159. The values are not shown.',
  'The answer of the case "claims-002" holds 3 things shaped like personal data: an email address at character 41, a phone number at character 75 and a card number at character 109. The values are not shown.',
  'In the category "motor" 1 of 3 cases pass (33.3 percent), below the minimum of 90 percent.',
  'This report is deterministic string checking of answers that are already in the file.',
  'RESULT: FAIL - 24 findings at or above error (24 error, 3 warning)'
];
// What must not be reported: the check the bad evaluation set cannot hold, the fake secrets and personal data, and a pass.
export const UNWANTED = ['ERROR    file-unreadable', 'lantern', 'thistle', '4f2a9c7e', 'jordan.rivera', '4111 1111', '555 0143', 'RESULT: PASS'];

// What the README says of the good evaluation set: no finding.
export const GOOD_EXPECTED = [
  'records: 13',
  'cases: 13 evaluated, 13 pass, 0 fail; pass rate 100.0 percent',
  'findings: 0',
  'RESULT: PASS - no finding at or above error'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad evaluation set', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good evaluation set', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  // The good evaluation set also passes when warnings and notes fail the run, and at the strictest pass rate.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  expect('good, every case must pass', await run([...GOOD, '--min-pass-rate', '100']), 0, ['findings: 0', 'RESULT: PASS - no finding at or above error'], []);
  expect('good, a minimum for one category', await run([...GOOD, '--category-min', 'claims=100', '--category-min', 'boundaries=100']), 0, ['category minimums claims=100, boundaries=100'], []);
  // The bad evaluation set with only the errors shown still counts the rest.
  expect('bad, errors only', await run([...BAD, '--min-severity', 'error']), 1, ['findings: 24 (24 error); 3 below error not shown'], ['WARNING  ', 'INFO     ']);
  // The bad evaluation set does not fail at a pass rate of zero for the categories, but its errors still fail it.
  expect('bad, minimum of zero', await run([...BAD, '--min-pass-rate', '0']), 1, ['findings: 23 (20 error, 3 warning)'], []);
  // A file that is not there stops the run with no report, and so does a threshold that is not a number.
  expect('missing file', await run(['examples/none/cases.jsonl']), 2, ['examples/none/cases.jsonl: does not exist'], [], 'err');
  expect('threshold that is not a number', await run([...GOOD, '--min-pass-rate', '120']), 2, ['--min-pass-rate: 120 is not a plain number of percent from 0 to 100'], [], 'err');

  // The README shows the head of the report of the bad evaluation set, two of its findings, the end of the report, and the head
  // and the end of the report of the good one.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = bad.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l.startsWith('Findings ('))).join('\n');
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad evaluation set differs from a real run');
  for (const [id, at] of [['fact-missing', 'examples/bad/cases.jsonl:2'], ['secret-like', 'examples/bad/cases.jsonl:9']]) {
    const i = lines.findIndex((l) => l.includes(id) && l.includes(at));
    const sample = lines.slice(i, i + 3).join('\n');
    if (i < 0 || !readme.includes(sample)) problems.push(`README: the sample finding of ${id} differs from a real run`);
  }
  const tail = lines.slice(-4).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad evaluation set differs from a real run');
  const goodLines = good.out.split('\n');
  const goodHead = goodLines.slice(0, goodLines.findIndex((l) => l.startsWith('Checks ('))).join('\n');
  if (!readme.includes(goodHead)) problems.push('README: the head of the sample output of the good evaluation set differs from a real run');
  const goodTail = goodLines.slice(-6).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good evaluation set differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  const outputs = [
    ['bad.txt', BAD, 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad.json', [...BAD, '--json'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['bad.junit.xml', [...BAD, '--format', 'junit'], 1],
    ['good.txt', GOOD, 0],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['good.junit.xml', [...GOOD, '--format', 'junit'], 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.md', ['--list-checks', '--format', 'markdown'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0],
    ['explain-fact-missing.txt', EXPLAIN, 0],
    ['explain-fact-missing.md', [...EXPLAIN, '--format', 'markdown'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
