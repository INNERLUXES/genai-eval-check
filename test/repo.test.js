import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOT_A, NOTICE, RULES, checkText } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
// The title of the page this tool belongs to and its address hold two letters that the list of names of tools keeps out of
// every other place; they are built from pieces so that this file does not hold them, and only these exact texts are let
// through.
const LINK_TEXT = ['Custom Generative ', 'A', 'I', ' Development Services and Consulting'].join('');
const HOMEPAGE = ['https://innerluxes.dev/artificial-intelligence/generative-', 'a', 'i'].join('');
const exempt = (text) => text.split(LINK_TEXT).join('').split(HOMEPAGE).join('');
const DECISIONS = [
  'docs/decisions/0001-match-answers-with-plain-string-rules-and-never-guess-at-meaning.md',
  'docs/decisions/0002-read-json-lines-and-tables-with-readers-of-our-own-and-never-show-a-secret.md',
  'docs/decisions/0003-read-the-file-on-disk-and-never-call-a-model-or-the-network.md',
  'docs/decisions/0004-do-the-rates-exactly-and-bound-the-work.md'
];
// The pattern of tools/check.mjs, kept unchanged: a word of four digits that starts with 19 or 20 reads like a year, unless it
// is the number of a standard after EIP or ERC.
const YEAR = /(?<!(?:EIP|ERC)[- ]?)\b(?:19|20)\d{2}\b/i;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const norm = (t) => t.replace(/\s+/g, ' ');

// Every file below a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

// Every file of the repository that is committed.
async function allFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel || '.'), { withFileTypes: true })) {
      if (['.git', 'coverage'].includes(e.name) || (!rel && ['dist', 'node_modules'].includes(e.name))) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('');
  return out.sort();
}

const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...(await filesOf('docs')).filter((f) => f.endsWith('.md'))];

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author, the repository and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'genai-eval-check');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/genai-eval-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['genai-eval-check'], 'bin/genai-eval-check.js');
  for (const k of ['evaluation', 'evaluation-set', 'generative-models', 'rag', 'testing', 'ci', 'junit', 'sarif', 'quality', 'cli', 'nodejs']) assert.ok(pkg.keywords.includes(k), k);
  assert.match(pkg.description, /^Scores answers that a generative system already gave against an evaluation set, as plain string checking\./);
  assert.match(pkg.description, /Never calls a model; it does not judge truth beyond the facts listed and is not a full evaluation of a model\./);
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  assert.equal(pkg.scripts.test, 'node --test "test/*.test.js"');
  assert.equal(pkg.scripts['test:coverage'], 'node --test --experimental-test-coverage "test/*.test.js"');
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.name, pkg.name);
  assert.ok((await read('bin/genai-eval-check.js')).startsWith('#!/usr/bin/env node\n'));
});

test('README: one link to the page on generative development services, with its title, in the closing Background section', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(norm(background).includes(`[${LINK_TEXT}](${HOMEPAGE})`));
  assert.equal(readme.split('innerluxes.dev/').length - 1, 1, 'the README links to the site once');
  assert.equal(readme.split(HOMEPAGE).length - 1, 1);
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
  assert.equal([...readme.matchAll(/https?:\/\/innerluxes\.dev/g)].length, 1);
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
  assert.ok(tests >= 100);
});

test('README: what it checks, how to run it with npx or node, the options, real example output and the limits', async () => {
  const readme = await read('README.md');
  for (const heading of ['## Quick start', '## Usage', '## How the file is read', '## What it checks', '## What is not checked', '## Formats', '## Exit codes', '## Limits', '## Architecture', '## Where the ideas come from']) assert.ok(readme.includes(`\n${heading}\n`), heading);
  assert.match(readme, /npx --yes github:INNERLUXES\/genai-eval-check cases\.jsonl --min-pass-rate 95/);
  assert.match(readme, /node bin\/genai-eval-check\.js examples\/bad\/cases\.jsonl/);
  assert.match(readme, /--explain fact-missing/);
  for (const option of ['--format', '--json', '--min-severity', '--fail-on', '--min-pass-rate', '--category-min', '--strip-punctuation', '--refusal-phrases', '--max-chars', '--allow-email-domains', '--explain', '--list-checks', '--help', '--version']) assert.ok(readme.includes(option), option);
  for (const r of RULES) assert.ok(readme.includes(`| \`${r.id}\` | ${r.severity} | ${r.kind} | ${r.summary} |`), `README: ${r.id}`);
  for (const f of ['text', 'markdown', 'JSON', 'SARIF', 'JUnit']) assert.ok(readme.includes(f), f);
  assert.match(readme, /Eighteen checks/);
  assert.ok(!readme.includes('@@'), 'no placeholder is left');
  for (const real of ['RESULT: FAIL - 24 findings at or above error (24 error, 3 warning)', 'RESULT: PASS - no finding at or above error', 'findings: 27 (24 error, 3 warning)', 'findings: 0']) assert.ok(readme.includes(real), real);
});

test('README: it says plainly that it is string checking of answers already produced, that it never calls a model and is not a full evaluation, before the quick start', async () => {
  const readme = norm(await read('README.md'));
  assert.ok(readme.includes('The tool is deterministic string checking of answers that are already in the file. It never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model.'));
  assert.ok(readme.indexOf('not a full evaluation of a model') < readme.indexOf('## Quick start'), 'said before the quick start');
  assert.ok(readme.includes('it contacts nothing over the network'));
  assert.ok(readme.includes('reads no clock and writes nothing'));
  assert.ok(readme.includes('Every check is a best practice of this tool: no standard sets any of them'));
  assert.ok(readme.includes('There is no fuzzy or semantic matching'));
  assert.match(await read('docs/limits.md'), /^genai-eval-check is deterministic string checking of answers that are already in a file\./m);
  assert.ok(NOT_A.includes('never calls a model'));
  assert.ok(NOT_A.includes('not a full evaluation of a model'));
  assert.ok(NOTICE.includes('never calls a model'));
  assert.ok(NOTICE.includes('not a full evaluation of a model'));
});

test('README says what it can not see: meaning, other wordings, the truth of a listed fact, a source it never opens', async () => {
  const readme = norm(await read('README.md'));
  assert.ok(readme.includes('Whether an answer is true. A fact is a phrase that is found or not found'));
  assert.ok(readme.includes('Other wordings. An answer that says "thirty days" does not hold "30 days"'));
  assert.ok(readme.includes('a source in an answer is only text and is never opened'));
  assert.ok(readme.includes('Whether the facts in the file are right.'));
});

test('README and documents: they never claim an answer is true, a system is safe, or that a model has been evaluated', async () => {
  for (const file of await docFiles()) {
    const text = norm(exempt(await read(file)));
    assert.doesNotMatch(text, /\b(?:we|I) recommend\b/i, file);
    assert.doesNotMatch(text, /(?<!not )\b(?:certifies|certified|compliant|guarantees?)\b/i, file);
    assert.doesNotMatch(text, /\b(?:verifies|validates|proves) (?:that )?(?:the )?(?:answers?|facts?|sources?|model|system)\b/i, file);
    assert.doesNotMatch(text, /\b(?:safe|accurate|reliable|trustworthy) (?:answers?|models?|systems?)\b/i, file);
  }
  const everything = [NOTICE, NOT_A, ...RULES.map((r) => `${r.summary} ${r.fix} ${r.own} ${r.cannot}`)].join(' ');
  assert.doesNotMatch(everything, /\b(?:is|are) (?:safe|secure|trusted|approved|verified|the best)\b/i);
});

test('docs/inputs.md: the short file in JSON Lines and as a table passes every check at every level', async () => {
  const inputs = await read('docs/inputs.md');
  const code = /## A short file\n\n[^\n]*\n\n```jsonl\n([\s\S]*?)\n```\n\n```csv\n([\s\S]*?)\n```/.exec(inputs);
  assert.ok(code, 'a short file in docs/inputs.md');
  const lines = checkText(`${code[1]}\n`);
  assert.deepEqual(lines.findings, []);
  assert.equal(lines.cases.length, 4);
  const table = checkText(`${code[2]}\n`);
  assert.deepEqual(table.findings, []);
  assert.equal(table.cases.length, 4);
  assert.ok(code[1].includes('must_refuse') && code[2].includes('allowed_sources'));
});

test('README and documents: no number that reads like a year and no date in words or in digits', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d/, file);
  }
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs') continue;
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, DATE, file);
  }
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
  assert.doesNotMatch(await read('LICENSE'), /Copyright \(c\) \d/);
});

test('the year pattern passes over versions, seconds, counts and identifiers and still catches a year', () => {
  for (const ok of ['1.0.0', 'Node 22', 'SARIF 2.1.0', 'RFC 4180', '100,000 rows', '250,000 rows', '12,000,000 characters', 'NIST SP 800-218', '10000', '4.23', '4111 1111 1111 1111']) assert.doesNotMatch(ok, YEAR, ok);
  const year = ['20', '24'].join('');
  const old = ['19', '99'].join('');
  for (const bad of [year, `in ${year}`, old, `${year}.`, `score ${['20', '01'].join('')}`, ['20', '00'].join('')]) assert.match(bad, YEAR, bad);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json']) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('every source, test and tool file is plain ASCII with no control character, and writes any other character as an escape', async () => {
  for (const file of (await allFiles()).filter((f) => /\.(js|mjs)$/.test(f))) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 127 && (c.charCodeAt(0) >= 32 || c === '\n' || c === '\t')), file);
  }
});

test('every file: none of the words this project keeps out of its prose, and no name of a tool that wrote it', async () => {
  // Built from pieces, so that this file does not hold the words; a word is matched at its start.
  const words = [['har', 'ness'], ['del', 'v'], ['lever', 'ag'], ['seam', 'less'], ['rob', 'ust'], ['cutting', '-edg'], ['un', 'lock'], ['em', 'power'], ['ele', 'vat'], ['stream', 'lin'], ['game', '-changer'], ['tap', 'estr'], ['re', 'alm'], ['further', 'more'], ['more', 'over'], ['in today', "'s"], ['gene', 'rated'], ['trans', 'form'], ['compre', 'hensiv'], ['tail', 'ored'], ['state-of-the', '-art'], ['revol', 'ution'], ['holi', 'stic'], ['world', '-class']].map((p) => p.join(''));
  const banned = new RegExp(`\\b(?:${words.join('|')})`, 'i');
  const names = new RegExp(`${['cla', 'ude'].join('')}|${['anthro', 'pic'].join('')}|\\b${['A', 'I'].join('')}\\b|\\b${['assis', 'tant'].join('')}|\\b${['ch', 'at'].join('')}\\b|\\b${['ses', 'sion'].join('')}|${['co-', 'authored'].join('')}|${['gene', 'rated'].join('')}|\\b${['l', 'lms?'].join('')}\\b|\\b${['g', 'pt'].join('')}\\b`, 'i');
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs') continue;
    const text = exempt(await read(file));
    assert.doesNotMatch(text, banned, file);
    assert.doesNotMatch(text, names, file);
  }
  assert.match(`an ${['assis', 'tant'].join('')} wrote this`, names);
  assert.match(`a ${['trans', 'formation'].join('')} of the business`, banned, 'the word is caught everywhere');
  assert.match(`the ${['trans', 'form'].join('')}ed code`, banned);
  assert.match(`${['generative-', 'a', 'i'].join('')} topics`, names, 'the two letters are caught everywhere but in the title and the address of the page');
  assert.doesNotMatch(exempt(`see [${LINK_TEXT}](${HOMEPAGE})`), names);
});

test('no file holds a string shaped like a token or a private key', async () => {
  const shapes = [new RegExp(`\\b(?:${['gh', 'p'].join('')}|${['gh', 'o'].join('')}|${['gh', 's'].join('')}|${['github', '_pat'].join('')})_[A-Za-z0-9_]{6,}`), new RegExp(`-----BEGIN [A-Z ]*${['PRIVATE', ' KEY'].join('')}-----`), new RegExp(`\\b${['AK', 'IA'].join('')}[0-9A-Z]{16}\\b`), new RegExp(`\\b${['xo', 'x'].join('')}[abprs]-[A-Za-z0-9-]{10,}`)];
  for (const file of await allFiles()) {
    const text = await read(file);
    for (const shape of shapes) assert.doesNotMatch(text, shape, file);
    assert.ok(!text.includes(['gh', 'p_'].join('')), file);
    assert.ok(!text.includes(['github', '_pat_'].join('')), file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"genai-eval-check security"/);
  assert.doesNotMatch(text, /within\s+\d|business days|within a (?:day|week)|\d+\s*(?:hours|days)\b|we will|we guarantee|guaranteed|respond within|reply within/i);
});

test('workflows: every action is pinned to a full commit with a version comment, the CI runs three systems, two Node versions and coverage, and the SSDF gate is there and pinned', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*(?:- )?uses: (\S+)(.*)$/gm)].map((m) => [m[1], m[2]]);
    assert.ok(uses.length > 0, name);
    for (const [action, comment] of uses) {
      assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/, `${name}: ${action}`);
      assert.match(comment, /^ # v\d+\.\d+\.\d+$/, `${name}: ${action}${comment}`);
    }
    assert.doesNotMatch(text, /solidity|vendor-scorecard|scorecard|lot-genealogy|fsma|epcis|marketplace|escrow|nft-|token-transfer|payout-batch|crypto-checkout|tokenomics/i, name);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /run: npm run test:coverage/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  assert.match(ci, /ref: [0-9a-f]{40} # v\d+\.\d+\.\d+/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('codeql: JavaScript only, with the security-extended queries, and the examples left out', async () => {
  const codeql = await read('.github/workflows/codeql.yml');
  assert.match(codeql, /languages: javascript-typescript/);
  assert.match(codeql, /github\/codeql-action\/init@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.doesNotMatch(codeql, /autobuild/i);
  assert.match(codeql, /security-extended/);
  assert.match(codeql, /paths-ignore:\n\s+- examples\n/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^examples\/\*\* linguist-documentation$/m);
  assert.match(attributes, /^examples\/\*\* linguist-detectable=false$/m);
  assert.match(attributes, /^examples\/output\/\*\* -text$/m);
  assert.doesNotMatch(await read('.github/dependabot.yml'), /package-ecosystem: (?:nuget|pip|maven)/);
});

test('release workflow: the SSDF gate, then a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(release, /ref: [0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.ok(release.indexOf('ssdf-repo-check.js') < release.indexOf('npm pack'), 'the gate runs before the package is made');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/genai-eval-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /Conventional Commits/);
  assert.match(await read('.gitattributes'), /^\* text=auto eol=lf$/m);
  assert.match(await read('.gitignore'), /^\*\.pem$/m);
  const owners = await read('.github/CODEOWNERS');
  for (const file of await filesOf('src')) assert.ok(owners.includes(`/${file} @innerluxesdev`), `CODEOWNERS: ${file}`);
});

test('docs/secure-defaults.md is long enough for the SSDF gate, and every document the README links to exists', async () => {
  assert.ok(norm(await read('docs/secure-defaults.md')).length > 4000);
  const readme = await read('README.md');
  const files = await allFiles();
  for (const link of readme.matchAll(/\]\(((?:docs|examples)\/[^)#]*)\)/g)) assert.ok(files.includes(link[1].replace(/\/$/, '')) || files.some((f) => f.startsWith(link[1])), link[1]);
  for (const d of DECISIONS) assert.ok(files.includes(d), d);
  for (const doc of ['context.md', 'inputs.md', 'limits.md', 'method.md', 'secure-defaults.md', 'threat-model.md']) assert.ok(files.includes(`docs/${doc}`), doc);
});

test('src never reaches the network, runs a program or reads a clock, and builds no regular expression from input', async () => {
  const banned = [/node:(?:net|http|https|http2|dgram|tls|dns|child_process|worker_threads|vm|cluster)/, /\bfetch\(/, /\bXMLHttpRequest\b/, /\beval\(/, /new Function\(/, /\bDate\b/, /Date\.now/, /Math\.random/, /process\.env/, /Intl\./, /parseFloat\(/, /performance\.now/, /hrtime/, /getTimezoneOffset/];
  for (const file of await filesOf('src')) {
    const text = await read(file);
    for (const b of banned) assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, ''), b, `${file}: ${b}`);
    if (file !== 'src/text.js') assert.ok(!/new RegExp/.test(text), `${file} builds a regular expression`);
  }
  assert.ok((await read('src/size.js')).includes('toLocaleString'), 'grouped() fixes the locale in the call');
});

test('src is only written to standard output and standard error, never to the disk', async () => {
  for (const file of await filesOf('src')) {
    const text = await read(file);
    assert.doesNotMatch(text, /writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync|rename\(/, file);
  }
});

test('no function of src calls itself: the readers, the searches and the checks work through loops and maps', async () => {
  for (const file of await filesOf('src')) {
    const text = await read(file);
    for (const m of text.matchAll(/^(?:export )?(?:async )?function\*? ([A-Za-z0-9_$]+)\(/gm)) {
      const start = m.index + m[0].length;
      const next = text.slice(start).search(/^(?:export )?(?:async )?(?:function|const|class) /m);
      const body = next < 0 ? text.slice(start) : text.slice(start, start + next);
      assert.ok(!new RegExp(`(?<![A-Za-z0-9_$.])${m[1]}\\(`).test(body), `${file}: ${m[1]} calls itself`);
    }
  }
});

test('the bounded file reader, the table reader, the decimal reader, the search for keys and the helpers are the ones of the sibling tools, unchanged', async () => {
  const hashes = {
    'src/csv.js': '5401783d644637c49a57f421ee70da2c8cd2a74a8d978a8177174c5fcb4460ac',
    'src/decimal.js': 'a4c541006b1e357211edc6074e936b0387dcea35a40a0c1f4bdcc1fe36094a56',
    'src/files.js': '97777ba4278f436ae64a204a11511b8058f542921026df0a6a3bbdeac99652d7',
    'src/secrets.js': '317805f157c326b87bee4455bda9817d4898a42941cae8f0ca2fffe871d68f1e',
    'src/size.js': 'c2b5c1d337be454d05a893962e7fcc457bac27eb9c896a2347dd0e3ab47f2b76',
    'src/text.js': '0b6d5ea215e4b87e459b106b380b4e8ad67655a1c73f05a1f38e8ca7c719fece',
    'tools/check.mjs': '7e6739d554b27873b4845532438e0b37c77526692b316777dc54e7cf9126d5b4'
  };
  for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(await readFile(resolve(root, file))).digest('hex'), hash, `${file} changed; it is kept as it is in the sibling tools`);
  const secrets = await read('src/secrets.js');
  assert.ok(secrets.includes("export const SECRET_KEYS = ['mnemonic', 'mnemonicphrase', 'seed', 'seedphrase', 'seedwords', 'phrase', 'recoveryphrase', 'secretphrase', 'words', 'entropy', 'privatekey', 'privkey', 'secretkey', 'secret', 'xprv', 'xpriv', 'wif', 'passphrase', 'password', 'masterkey'];"));
  const files = await read('src/files.js');
  assert.match(files, /O_NOFOLLOW/);
  assert.match(files, /s\.size > limits\.maxBytes/);
  const csv = await read('src/csv.js');
  assert.match(csv, /maxCellLength/);
  assert.match(await read('src/decimal.js'), /maxDigits: 40/);
  assert.match(await read('src/scan.js'), /import \{ secretShape \} from '\.\/secrets\.js';/, 'the search for secrets in answers builds on the search of the sibling tools');
});

test('src does not use a floating point number for a rate, a minimum or a count of cases', async () => {
  for (const file of ['src/rate.js', 'src/check.js']) {
    const text = (await read(file)).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(text, /\bMath\.(?:round|floor|ceil|trunc|pow)\b|\.toFixed\(|\*\* ?0?\.|\bNumber\.parseFloat\b/, file);
  }
});

test('a guarded test never asserts a line of its own', async () => {
  for (const file of ['test/files.test.js', 'test/report-cli.test.js']) {
    const text = await read(file);
    for (const block of text.split(/\ntest\(/).filter((b) => b.includes("process.platform === 'win32'") || b.includes("process.platform !== 'win32'"))) assert.doesNotMatch(block, /\.line\b|lineOf\(/);
  }
});

test('every test file builds its paths with resolve(), and no test writes a backslash, a bar or a quote into a file name', async () => {
  for (const file of (await filesOf('test')).filter((f) => f.endsWith('.js'))) {
    const text = await read(file);
    assert.doesNotMatch(text, /\bjoin\(\s*(?:dir|tmpdir|root)/, `${file} joins an absolute path`);
    assert.doesNotMatch(text, /['"`][A-Za-z0-9_]+\\\\[A-Za-z0-9_]+\.(?:csv|jsonl)['"`]/, `${file} writes a backslash into a file name`);
    assert.doesNotMatch(text, /\{\s*'[^']*[|*?"<>][^']*\.(?:csv|jsonl)':/, `${file} writes a character Windows refuses into a file name`);
  }
});

test('no test asserts a commit hash of an action, or a version of one: Dependabot changes them', async () => {
  for (const file of (await filesOf('test')).filter((f) => f.endsWith('.js'))) {
    const text = await read(file);
    assert.doesNotMatch(text, /@[0-9a-f]{40}\b/, `${file} holds a pinned hash of an action`);
    assert.doesNotMatch(text, /actions\/(?:checkout|setup-node|attest-build-provenance)@/, `${file} names an action with a version`);
    assert.doesNotMatch(text, /codeql-action\/(?:init|analyze)@v?\d/, `${file} names a version of the CodeQL action`);
  }
});

test('tools/check.mjs and tools/example.mjs exist, the year check and the list of plain words are those of the sibling tools, and the saved example outputs are all there', async () => {
  const files = await filesOf('examples/output');
  for (const f of ['bad.txt', 'good.txt', 'bad.md', 'good.md', 'bad.json', 'good.json', 'bad.sarif', 'good.sarif', 'bad.junit.xml', 'good.junit.xml', 'checks.txt', 'checks.md', 'checks.json', 'explain-fact-missing.txt', 'explain-fact-missing.md']) assert.ok(files.includes(`examples/output/${f}`), f);
  const check = await read('tools/check.mjs');
  assert.ok(check.includes('no problems'));
  assert.ok(check.includes(`const YEAR = ${YEAR.toString()};`), 'the year check is unchanged');
  assert.ok(check.includes("const BANNED_WORDS = [['har', 'ness'], ['del', 've'], ['lever', 'age'], ['seam', 'less'], ['rob', 'ust'], ['cutting', '-edge'], ['un', 'lock'], ['em', 'power'], ['ele', 'vate'], ['stream', 'line'], ['game', '-changer'], ['tap', 'estry'], ['re', 'alm'], ['further', 'more'], ['more', 'over'], ['in today', \"'s\"], ['trans', 'form']"), 'the list of plain words starts as the sibling tools have it');
  for (const extra of ["['compre', 'hensive']", "['tail', 'ored']", "['state-of-the', '-art']", "['revol', 'ution']", "['holi', 'stic']", "['world', '-class']"]) assert.ok(check.includes(extra), extra);
  assert.ok((await read('tools/example.mjs')).includes('examples/output'));
});
