// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools, SARIF for code scanning
// and JUnit XML for the test view of a build system. Every text that comes from the input (a file name, an id, a category, a
// message) was cleaned by safeText before it reached the report object. The markdown format also escapes what markdown gives a
// meaning to, the XML format escapes what XML gives a meaning to and drops the characters XML 1.0 cannot hold, and the SARIF
// and JSON formats are built as objects and written by JSON.stringify.

import { BEST, NOT_A, NO_CATEGORY } from './data.js';
import { RULES } from './rules.js';
import { nameKey } from './collect.js';
import { grouped, plural } from './size.js';

const URI = 'https://github.com/INNERLUXES/genai-eval-check';

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (f) => `${f.file} (${f.format}, ${plural(f.lines, 'line')}, ${plural(f.bytes, 'byte')})`;

const rateLine = (s) => (s.passRate === null ? 'no case was evaluated' : `${grouped(s.evaluated)} evaluated, ${grouped(s.passed)} pass, ${grouped(s.failed)} fail; pass rate ${s.passRate} percent`);

const settingsLine = (r) => {
  const o = r.options;
  const parts = [`minimum pass rate ${o.minPassRate} percent`];
  if (o.categoryMin.length) parts.push(`category minimums ${o.categoryMin.join(', ')}`);
  parts.push(o.stripPunctuation ? 'punctuation stripped' : 'punctuation kept');
  parts.push(`refusal phrases: ${o.refusalPhrases}`);
  if (o.maxChars !== null) parts.push(`longest answer ${grouped(o.maxChars)} characters`);
  if (o.allowEmailDomains.length) parts.push(`email domains allowed: ${o.allowEmailDomains.join(', ')}`);
  return parts.join('; ');
};

// What the file says, a line for each part.
function inputLines(r) {
  const s = r.summary;
  return [
    ['records', `${grouped(s.records)}${s.leftOut ? ` (${grouped(s.evaluated)} evaluated, ${plural(s.leftOut, 'record')} left out)` : ''}`],
    ['cases', rateLine(s)],
    ['settings', settingsLine(r)]
  ];
}

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const CATEGORY_HEAD = ['category', 'cases', 'pass', 'fail', 'pass rate', 'minimum'];
const categoryRows = (r) => r.summary.categories.map((c) => [c.category, grouped(c.cases), grouped(c.passed), grouped(c.failed), `${c.passRate}%`, `${c.minimum}%${c.below ? ' (below)' : ''}`]);

const PAD = ' '.repeat(11);

export function toText(r) {
  const out = [];
  out.push(`genai-eval-check: ${r.input.file}`);
  out.push(`file: ${fileLine(r.input)}`);
  for (const [k, v] of inputLines(r)) out.push(`${k}: ${v}`);
  out.push(`findings: ${findingsLine(r)}`);
  if (r.summary.categories.length) {
    out.push('', `Categories (${grouped(r.summary.categories.length)})`, '');
    out.push(...table(CATEGORY_HEAD, categoryRows(r)));
    out.push('', 'A case passes when it has no finding of a check about cases at the error level. The pass rate is the cases that pass over the cases evaluated, rounded to one decimal; it is compared with the minimum exactly.');
  }
  out.push('', `Checks (${grouped(r.rules.length)})`, '');
  out.push(...table(['check', 'level', 'kind', 'findings'], r.rules.map((x) => [x.id, x.level, x.kind, grouped(x.findings)])), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

export function toMarkdown(r) {
  const out = [];
  out.push(`# genai-eval-check: ${md(r.input.file)}`, '');
  out.push(`- File: ${md(fileLine(r.input))}`);
  for (const [k, v] of inputLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  if (r.summary.categories.length) {
    out.push('## Categories', '');
    out.push('| Category | Cases | Pass | Fail | Pass rate | Minimum |', '| --- | --- | --- | --- | --- | --- |');
    for (const row of categoryRows(r)) out.push(`| ${row.map(md).join(' | ')} |`);
    out.push('');
  }
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r) {
  return `${JSON.stringify(r, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the file as the artifact, and one result for each finding with its line and
// column. The pass rates have no place in SARIF and are left out.
export function toSarif(r) {
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'genai-eval-check',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: [{ location: { uri: r.input.file } }],
        results: r.findings.map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: 0 }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject, caseId: f.caseId }
        })),
        properties: { notice: r.notice, result: r.result.text }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// Text for XML: the five characters XML gives a meaning to are escaped, and the characters XML 1.0 cannot hold (a lone
// surrogate, U+FFFE and U+FFFF) are replaced by a question mark.
const xml = (t) => String(t)
  .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]|[\ufffe\uffff]/g, '?')
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

// JUnit XML: a test suite for each category with a test for each case, a suite for the problems of the input and a suite with a
// test for the pass rate of each category. A case that does not pass is a failure with its findings. No time is recorded,
// because the tool reads no clock, so every time is 0.
export function toJunit(r) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const suites = [];
  const label = (c) => (c.category === '' ? NO_CATEGORY : c.category);
  const byCase = new Map();
  for (const f of r.findings) {
    if (f.caseIndex === null) continue;
    if (!byCase.has(f.caseIndex)) byCase.set(f.caseIndex, []);
    byCase.get(f.caseIndex).push(f);
  }
  for (const category of r.summary.categories) {
    const key = category.category;
    const cases = r.cases.filter((c) => nameKey(label(c)) === nameKey(key));
    const lines = [];
    let failures = 0;
    for (const c of cases) {
      const found = byCase.get(c.index) ?? [];
      const errors = found.filter((f) => f.severity === 'error' && f.kind === 'case');
      const rest = found.filter((f) => !errors.includes(f));
      const head = `    <testcase classname="${xml(key)}" name="${xml(c.id)}" file="${xml(r.input.file)}" line="${c.line}" time="0"`;
      if (c.passed && rest.length === 0) lines.push(`${head}/>`);
      else {
        lines.push(`${head}>`);
        if (!c.passed) {
          failures += 1;
          const ids = c.findings.filter((id) => RULES.find((x) => x.id === id && x.kind === 'case' && x.severity === 'error'));
          const message = errors.length ? errors.map((f) => f.id).join(', ') : ids.join(', ');
          lines.push(`      <failure type="${xml(errors[0]?.id ?? ids[0] ?? 'failed')}" message="${xml(message)}">${xml(errors.map((f) => `${f.id}: ${f.message}`).join('\n') || ids.join('\n'))}</failure>`);
        }
        if (rest.length) lines.push(`      <system-out>${xml(rest.map((f) => `${f.severity} ${f.id}: ${f.message}`).join('\n'))}</system-out>`);
        lines.push('    </testcase>');
      }
    }
    suites.push({ name: key, tests: cases.length, failures, errors: 0, body: lines });
  }
  const problems = r.findings.filter((f) => f.kind === 'input');
  if (problems.length) {
    const lines = problems.map((f) => `    <testcase classname="input" name="${xml(`${f.id} at line ${f.line}`)}" file="${xml(r.input.file)}" line="${f.line}" time="0">\n      <error type="${xml(f.id)}" message="${xml(f.message)}">${xml(`${f.id}: ${f.message} Fix: ${f.fix}`)}</error>\n    </testcase>`);
    suites.push({ name: 'input', tests: problems.length, failures: 0, errors: problems.length, body: lines });
  }
  if (r.summary.categories.length) {
    let failures = 0;
    const lines = r.summary.categories.map((c) => {
      const head = `    <testcase classname="categories" name="${xml(`pass rate of ${c.category}`)}" time="0"`;
      if (!c.below) return `${head}/>`;
      failures += 1;
      const text = `${c.passed} of ${c.cases} cases pass (${c.passRate} percent), below the minimum of ${c.minimum} percent`;
      return `${head}>\n      <failure type="category-pass-rate-below" message="${xml(text)}">${xml(text)}</failure>\n    </testcase>`;
    });
    suites.push({ name: 'categories', tests: r.summary.categories.length, failures, errors: 0, body: lines });
  }
  const sum = (key) => suites.reduce((n, s) => n + s[key], 0);
  out.push(`<testsuites name="genai-eval-check" tests="${sum('tests')}" failures="${sum('failures')}" errors="${sum('errors')}" time="0">`);
  for (const s of suites) {
    out.push(`  <testsuite name="${xml(s.name)}" tests="${s.tests}" failures="${s.failures}" errors="${s.errors}" skipped="0" time="0">`);
    out.push(...s.body);
    out.push('  </testsuite>');
  }
  out.push('</testsuites>', '');
  return out.join('\n');
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['genai-eval-check checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(8)}  ${x.summary}`);
  out.push('', `Every check is ${BEST}. A check of the input is about the file, a record, a field or an id, a check of a case is found from the answer of one case, and a check of a category counts the cases of a category. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# genai-eval-check checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, own: x.own, cannot: x.cannot })), null, 2)}\n`;
}

export function explainText(rule) {
  const out = [`${rule.id}`, ''];
  out.push(`level: ${rule.severity}`, `kind: ${rule.kind}`, '');
  out.push(`what it looks at: ${rule.summary}`, '', `why it exists: ${rule.own}`, '', `what to change: ${rule.fix}`, '', `what it cannot see: ${rule.cannot}`, '');
  out.push(`This check is ${BEST}. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function explainMarkdown(rule) {
  const out = [`# ${md(rule.id)}`, ''];
  out.push(`- Level: ${rule.severity}`, `- Kind: ${rule.kind}`, '');
  out.push(`**What it looks at.** ${md(rule.summary)}`, '', `**Why it exists.** ${md(rule.own)}`, '', `**What to change.** ${md(rule.fix)}`, '', `**What it cannot see.** ${md(rule.cannot)}`, '');
  out.push(`This check is ${md(BEST)}.`, '');
  return out.join('\n');
}

export function explainJson(rule) {
  return `${JSON.stringify({ id: rule.id, severity: rule.severity, kind: rule.kind, summary: rule.summary, fix: rule.fix, own: rule.own, cannot: rule.cannot, note: `This check is ${BEST}.` }, null, 2)}\n`;
}

