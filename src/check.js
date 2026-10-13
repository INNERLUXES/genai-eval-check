// A run: read the file of cases as JSON Lines or as a table, check every case, count the cases that pass in each category and
// build the report object that the formats write.

import { createCollector, nameKey, show } from './collect.js';
import { DEFAULTS, LEVELS, LIMITS as WORK_LIMITS, NO_CATEGORY, NOTICE, REFUSAL_PHRASES } from './data.js';
import { FILE_LIMITS, InputError, displayPath, locateInput, readInputText } from './files.js';
import { evaluateCase } from './evaluate.js';
import { createWork, normalizeText } from './match.js';
import { percentText, rateBelow, readPercent } from './rate.js';
import { idKey, readCases } from './read.js';
import { RULES, decide, ruleById } from './rules.js';
import { safeText } from './text.js';

export { InputError };

export const LIMITS = { ...FILE_LIMITS, ...WORK_LIMITS };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };
const KIND_ORDER = { input: 0, case: 1, category: 2 };

const MAX_REFUSAL_PHRASES = 1000;
const MAX_REFUSAL_CHARS = 200;

// The refusal phrases of a file: one phrase on each line, empty lines and lines that start with # left out.
export function parsePhraseList(text) {
  const phrases = text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  if (phrases.length === 0) throw new InputError(['the refusal phrase file holds no phrase']);
  if (phrases.length > MAX_REFUSAL_PHRASES) throw new InputError([`the refusal phrase file holds more than ${MAX_REFUSAL_PHRASES} phrases`]);
  if (phrases.some((p) => p.length > MAX_REFUSAL_CHARS)) throw new InputError([`the refusal phrase file holds a phrase longer than ${MAX_REFUSAL_CHARS} characters`]);
  return phrases;
}

// A "category=percent" text: { key, text, percent } or null.
export function parseCategoryMin(text) {
  const at = text.lastIndexOf('=');
  if (at <= 0) return null;
  const key = text.slice(0, at).trim();
  const percent = readPercent(text.slice(at + 1).trim());
  if (key === '' || percent === null) return null;
  return { key, percent };
}

// The domains of a comma separated list, in lower case; null when an entry is not a plain domain.
export function parseDomains(text) {
  const out = [];
  for (const part of text.split(',')) {
    const d = part.trim().toLowerCase();
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(d)) return null;
    out.push(d);
  }
  return out;
}

// The options of a run, each given as text or left to its default. categoryMin is a list of "category=percent" texts and
// refusalPhrases a list of phrases (or null for the default list). A value that cannot be used throws an Error whose message
// says which.
export function readOptions({ minPassRate = null, categoryMin = [], stripPunctuation = false, refusalPhrases = null, maxChars = null, allowEmailDomains = null } = {}) {
  const min = readPercent(minPassRate ?? DEFAULTS.minPassRate);
  if (min === null) throw new Error(`--min-pass-rate: ${show(String(minPassRate), 40)} is not a plain number of percent from 0 to 100`);
  const perCategory = new Map();
  for (const text of categoryMin) {
    const parsed = parseCategoryMin(text);
    if (parsed === null) throw new Error(`--category-min: ${show(text, 60)} is not category=percent, with a plain number of percent from 0 to 100`);
    if (perCategory.has(nameKey(parsed.key))) throw new Error(`--category-min: the category ${show(parsed.key, 60)} was given twice`);
    perCategory.set(nameKey(parsed.key), parsed);
  }
  let limit = null;
  if (maxChars !== null) {
    if (!/^[1-9][0-9]{0,8}$/.test(maxChars)) throw new Error(`--max-chars: ${show(String(maxChars), 40)} is not a whole number from 1 to 999999999`);
    limit = Number(maxChars);
  }
  let domains = [];
  if (allowEmailDomains !== null) {
    domains = parseDomains(allowEmailDomains);
    if (domains === null) throw new Error(`--allow-email-domains: ${show(String(allowEmailDomains), 60)} is not a comma separated list of domains such as example.com`);
  }
  const phrases = refusalPhrases ?? REFUSAL_PHRASES;
  return { minPassRate: min, categoryMin: perCategory, stripPunctuation, refusalPhrases: phrases, refusalDefault: refusalPhrases === null, maxChars: limit, allowDomains: new Set(domains) };
}

// The findings of the text of a cases file, with no file system. Returns { format, cases, records, leftOut, categories,
// findings, notes, omitted }.
export function checkText(text, { limits = LIMITS, options = readOptions() } = {}) {
  const collector = createCollector();
  const { add, notes } = collector;
  const read = readCases(text, add, notes);
  const ctx = {
    strip: options.stripPunctuation,
    refusal: [...new Set(options.refusalPhrases.map((p) => normalizeText(p, { stripPunctuation: options.stripPunctuation })).filter((p) => p !== ''))],
    maxChars: options.maxChars,
    allowDomains: options.allowDomains,
    work: createWork(limits.maxWork)
  };
  const seen = new Map();
  const results = [];
  let leftOut = read.leftOut;
  for (const c of read.cases) {
    const key = idKey(c.id);
    if (seen.has(key)) {
      add('id-duplicate', { line: c.line, column: c.column }, `The id "${show(c.id)}" is the id of the case on line ${seen.get(key)} too; the second record was left out.`, c.id);
      leftOut += 1;
      continue;
    }
    seen.set(key, c.line);
    if (c.question.trim() === '') add('question-empty', { line: c.line, column: c.column }, `The case "${show(c.id)}" has no question.`, c.id);
    c.index = results.length;
    const ids = evaluateCase(c, ctx, add);
    const passed = !ids.some((id) => ruleById(id).kind === 'case' && ruleById(id).severity === 'error');
    results.push({ index: c.index, id: c.id, category: c.category, line: c.line, ids, passed });
  }
  const groups = new Map();
  for (const r of results) {
    const label = r.category === '' ? NO_CATEGORY : r.category;
    const key = nameKey(label);
    if (!groups.has(key)) groups.set(key, { category: label, cases: 0, passed: 0, line: r.line });
    const g = groups.get(key);
    g.cases += 1;
    if (r.passed) g.passed += 1;
  }
  for (const [key, entry] of options.categoryMin) {
    if (read.cases.length > 0 && !groups.has(key)) throw new InputError([`--category-min names the category "${show(entry.key, 60)}", which no case has; the categories in the file are ${[...groups.values()].map((g) => `"${show(g.category, 40)}"`).join(', ') || 'none'}`]);
  }
  const categories = [...groups.entries()].map(([key, g]) => {
    const own = options.categoryMin.get(key);
    const min = own ? own.percent : options.minPassRate;
    const below = rateBelow(g.passed, g.cases, min);
    if (below) {
      add('category-pass-rate-below', { line: g.line, column: 1 }, `In the category "${show(g.category)}" ${g.passed.toLocaleString('en-US')} of ${g.cases.toLocaleString('en-US')} cases pass (${percentText(g.passed, g.cases)} percent), below the minimum of ${min.text} percent.`, g.category);
    }
    return { category: g.category, cases: g.cases, passed: g.passed, failed: g.cases - g.passed, passRate: percentText(g.passed, g.cases), minimum: min.text, below };
  });
  return { format: read.format, cases: results, records: read.records, leftOut, categories, findings: collector.findings, notes, omitted: collector.omitted };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// The report object for the findings. file is { file, bytes, lines }.
export function buildReport({ file, checked, version, minSeverity = 'info', failOn = 'error', options = readOptions() }) {
  const names = new Map(checked.cases.map((c) => [c.index, c.id]));
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      file: file.file,
      line: f.line,
      column: f.column,
      at: `${file.file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      caseId: f.caseIndex === null ? null : clean(names.get(f.caseIndex) ?? '', 120),
      caseIndex: f.caseIndex,
      fix: rule.fix,
      kind: rule.kind
    };
  });
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.line - b.line || a.column - b.column || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const omitted = checked.omitted;
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const extra = (rule) => omitted.get(rule.id) ?? 0;
  const byLevel = { error: 0, warning: 0, info: 0 };
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  for (const f of shown) byLevel[f.severity] += 1;
  for (const rule of RULES) {
    allByLevel[rule.severity] += extra(rule);
    if (LEVELS.indexOf(rule.severity) >= LEVELS.indexOf(minSeverity)) byLevel[rule.severity] += extra(rule);
  }
  const total = (o) => o.error + o.warning + o.info;
  const notes = [...checked.notes];
  for (const [id, n] of omitted) notes.push(`${n.toLocaleString('en-US')} more findings of ${id} are not listed; the first 1,000 are`);
  const evaluated = checked.cases.length;
  const passed = checked.cases.filter((c) => c.passed).length;
  return {
    tool: 'genai-eval-check',
    version,
    input: { file: file.file, format: checked.format, bytes: file.bytes, lines: file.lines },
    summary: {
      records: checked.records,
      evaluated,
      leftOut: checked.leftOut,
      passed,
      failed: evaluated - passed,
      passRate: evaluated > 0 ? percentText(passed, evaluated) : null,
      categories: checked.categories.map((c) => ({ ...c, category: clean(c.category, 120) }))
    },
    cases: checked.cases.map((c) => ({ index: c.index, id: clean(c.id, 120), category: clean(c.category, 120), line: c.line, passed: c.passed, findings: c.ids })),
    totals: { findings: total(byLevel), byLevel, hidden: total(allByLevel) - total(byLevel) },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: shown.filter((f) => f.id === r.id).length + (LEVELS.indexOf(r.severity) >= LEVELS.indexOf(minSeverity) ? extra(r) : 0) })),
    options: {
      minSeverity,
      failOn,
      minPassRate: options.minPassRate.text,
      categoryMin: [...options.categoryMin.values()].map((e) => `${clean(e.key, 60)}=${e.percent.text}`),
      stripPunctuation: options.stripPunctuation,
      maxChars: options.maxChars,
      refusalPhrases: options.refusalDefault ? 'default list' : `${options.refusalPhrases.length} from a file`,
      allowEmailDomains: [...options.allowDomains]
    },
    findings: shown,
    notes: notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

async function load({ path, limits, base }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  return { absolute, text, file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) } };
}

// Reads the cases file and builds the report. refusalPath is a file of refusal phrases, one on each line; it is read the same
// bounded way, and when it is given its phrases replace the default list.
export async function checkFile({ path, refusalPath = null, minSeverity = 'info', failOn = 'error', options = null, optionValues = {}, version, limits = LIMITS, base = process.cwd() }) {
  let phrases = null;
  if (refusalPath !== null) {
    const refusal = await load({ path: refusalPath, limits, base });
    phrases = parsePhraseList(refusal.text);
  }
  const used = options ?? readOptions({ ...optionValues, refusalPhrases: phrases });
  const cases = await load({ path, limits, base });
  const checked = checkText(cases.text, { limits, options: used });
  return buildReport({ file: cases.file, checked, version, minSeverity, failOn, options: used });
}
