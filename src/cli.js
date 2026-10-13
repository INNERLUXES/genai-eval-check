// Command line: genai-eval-check <cases.jsonl|cases.csv> [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFile, readOptions } from './check.js';
import { DEFAULTS, LEVELS } from './data.js';
import { editDistance } from './fields.js';
import { explainJson, explainMarkdown, explainText, listChecksJson, listChecksMarkdown, listChecksText, toJson, toJunit, toMarkdown, toSarif, toText } from './report.js';
import { RULES, ruleById } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif, junit: toJunit };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };
const EXPLAINS = { text: explainText, markdown: explainMarkdown, json: explainJson };

export const USAGE = `Usage: genai-eval-check <cases file> [options]

Scores answers that a generative system already gave against an evaluation set, as plain string checking. It reads a file of
cases (JSON Lines, one object on each line, or CSV or TSV with a header row) with an id, a category, a question, the answer
that was given, the facts it must hold, alternatives, forbidden phrases, the sources it may cite and whether the right answer
is a refusal, and lists, with the line, the answers that miss expected facts, cite sources outside the allowed set, contain
forbidden phrases, leak strings that look like secrets or personal data, refuse when they should answer or answer when they
should refuse, or run too long, with the pass rate of each category, which a build can fail on. It never calls a model. It
contacts nothing over the network, reads no clock and writes nothing to disk.

Options:
  --format <name>            text, markdown, json, sarif or junit (default: text)
  --json                     the same as --format json
  --min-severity <level>     the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>          the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --min-pass-rate <percent>  the share of the cases of a category that must pass, from 0 to 100 (default: ${DEFAULTS.minPassRate})
  --category-min <key=value> a minimum for one category, such as billing=95; may be given more than once
  --strip-punctuation        take punctuation out of the answer and the phrases before they are compared
  --refusal-phrases <file>   a file of phrases, one on each line, that mean a refusal; it replaces the default list
  --max-chars <number>       the most characters an answer may have when its case sets no max_chars
  --allow-email-domains <list>
                             domains, separated by commas, whose email addresses an answer may hold
  --list-checks              list the checks with their level and kind, and exit
  --explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
  --help                     show this text
  --version                  show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

// The check whose id is nearest to the text, for a message about a misspelt id.
function nearestId(text) {
  let best = null;
  let bestDistance = Infinity;
  for (const r of RULES) {
    const d = editDistance(text.toLowerCase(), r.id);
    if (d < bestDistance) {
      best = r.id;
      bestDistance = d;
    }
  }
  return bestDistance <= 6 ? best : null;
}

export function parseArgs(argv) {
  const o = { paths: [], format: null, json: false, minSeverity: null, failOn: null, minPassRate: null, categoryMin: [], stripPunctuation: false, refusalPhrases: null, maxChars: null, allowEmailDomains: null, listChecks: false, explain: null, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (a === '--strip-punctuation') o.stripPunctuation = true;
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '--min-pass-rate') o.minPassRate = once(a, o.minPassRate, next());
    else if (a === '--category-min') o.categoryMin.push(next());
    else if (a === '--refusal-phrases') o.refusalPhrases = once(a, o.refusalPhrases, next());
    else if (a === '--max-chars') o.maxChars = once(a, o.maxChars, next());
    else if (a === '--allow-email-domains') o.allowEmailDomains = once(a, o.allowEmailDomains, next());
    else if (a === '--explain') o.explain = once(a, o.explain, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else {
      if (o.paths.length === 1) throw new Error('give one cases file');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${safeText(o.format, 40)} (text, markdown, json, sarif or junit)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${safeText(v, 40)} (${LEVELS.join(', ')})`);
  if (o.explain !== null && ruleById(o.explain) === undefined) {
    const near = nearestId(o.explain);
    throw new Error(`--explain: unknown check ${safeText(o.explain, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
  }
  if ((o.listChecks || o.explain !== null) && (o.format === 'sarif' || o.format === 'junit')) throw new Error(`${o.listChecks ? '--list-checks' : '--explain'} has no ${o.format.toUpperCase()} form; use text, markdown or json`);
  if (!o.help && !o.version && !o.listChecks && o.explain === null) {
    if (o.paths.length !== 1) throw new Error('give the cases file, such as genai-eval-check cases.jsonl');
    for (const p of [o.paths[0], o.refusalPhrases]) if (p !== null && isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    optionsOf(o);
  }
  return o;
}

// The options of a run from the parsed arguments; throws an Error that names the option that cannot be used.
function optionsOf(o, phrases = null) {
  return readOptions({ minPassRate: o.minPassRate, categoryMin: o.categoryMin, stripPunctuation: o.stripPunctuation, refusalPhrases: phrases, maxChars: o.maxChars, allowEmailDomains: o.allowEmailDomains });
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`genai-eval-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  if (o.explain !== null) {
    io.out(EXPLAINS[o.format](ruleById(o.explain)));
    return 0;
  }
  const merged = { ...LIMITS, ...(limits ?? {}) };
  try {
    const report = await checkFile({
      path: o.paths[0],
      refusalPath: o.refusalPhrases,
      minSeverity: o.minSeverity ?? 'info',
      failOn: o.failOn ?? 'error',
      optionValues: { minPassRate: o.minPassRate, categoryMin: o.categoryMin, stripPunctuation: o.stripPunctuation, maxChars: o.maxChars, allowEmailDomains: o.allowEmailDomains },
      version: VERSION,
      limits: merged,
      base
    });
    io.out(FORMATS[o.format](report));
    return report.result.pass ? 0 : 1;
  } catch (error) {
    if (error instanceof InputError) io.err(`genai-eval-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`genai-eval-check: ${clean(error.message)}\n`);
    return 2;
  }
}
