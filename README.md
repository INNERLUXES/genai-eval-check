# genai-eval-check

Check saved answers of a generative system against an evaluation set. Give it a file of cases, as JSON Lines or as CSV or TSV
with a header row, where each case holds a question, the answer the system already gave, the facts the answer must hold, the
sources it may cite, the phrases it must not contain and whether the right answer is a refusal. It lists, with the line of the
case, answers that miss expected facts, cite sources outside the allowed set, contain forbidden phrases, leak strings that
look like secrets or personal data, refuse when they should answer or answer when they should refuse, or run too long, and it
gives the pass rate of each category, which a build can fail on. The run exits with a code a pipeline can act on, and the
JUnit report shows each case as a test.

**The tool is deterministic string checking of answers that are already in the file. It never calls a model, it does not judge
whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model.** A clean
run means only that none of the problems of its checks were found in the text of the file. There is no fuzzy or semantic
matching: a fact is a phrase that is found or not found, after Unicode NFKC, lower casing, white space collapsed and, if you
ask, punctuation taken out (docs/decisions/0001 says why). Every check is a best practice of this tool: no standard sets any
of them, and the reports say so. It reads the file you give it and nothing else: it contacts nothing over the network (a
source in an answer is only text and is never opened), runs nothing, needs no key, reads no clock and writes nothing.

The mistakes in a saved set of answers tend to be the same: a number that changed after a prompt edit, a source the system was
never meant to use, a promise the business does not make, a refusal that turned into an answer or the other way round, a key
or an email address that a model repeated from a document it read. They get past a spot check and are cheap to find with a
file of cases. This tool reads that file on every build and points at the case.

- **One check per problem.** Eighteen checks, each marked as a check of the input, of a case or of a category, each with what
  it looks at, what to change, why it is a check at all and what it cannot see. Each message says what was found and where.
- **Expected facts and alternatives.** Every phrase of `expected_facts` must be in the answer; a group of `any_of` is met by any
  one of its wordings. A phrase is found on word edges, so `250` is not found in `2,500` and `can` is not found in `cancel`.
- **Sources.** The sources an answer cites are listed in `cited_sources` or read from its text (web addresses, `doc:` ids and
  markers such as `[2]` that `sources` explains) and compared with `allowed_sources`. A citation outside the set, and no
  citation at all, are errors.
- **Forbidden phrases and refusals.** A case that must be refused needs a refusal phrase in the answer (the list is documented
  and can be replaced); a case that must be answered must not hold one.
- **Secrets and personal data, never echoed.** An answer is searched for keys, seed phrases and tokens, and for email
  addresses, phone numbers and card numbers that pass the Luhn check. Only the kind and the position are reported, never the
  value.
- **Pass rate for each category, exact.** A case passes when it has no error-level finding. A category below
  `--min-pass-rate` (default 90 percent), or below its own `--category-min`, is an error. The rates are two whole numbers
  compared by cross multiplication (BigInt) and rounded to one decimal only when shown.
- **A reader of its own.** The CSV and TSV reader keeps the line and column of every cell and refuses what it cannot follow. A
  record that cannot be read or used is an error and is counted as left out; it is never skipped without a word, and a list is
  never read in part.
- **Bounded work.** Lines nested deeply are refused before they are parsed, lists and phrases have limits, and a work budget
  stops a run that would search too much. A hundred thousand cases, an answer of ten million characters and a list of a
  million facts all end quickly.
- Reports as text, markdown, JSON, SARIF and JUnit XML, with an exit code for a pipeline: `0` no finding at or above the
  `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 202
pass 200
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic
link or a device (a link to a cases file, and `/dev/null` named as a file); they are guarded with `process.platform`, run on
Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits
are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/genai-eval-check.git
cd genai-eval-check
node bin/genai-eval-check.js examples/bad/cases.jsonl
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/genai-eval-check cases.jsonl --min-pass-rate 95
```

To see why a check exists, what it cannot see and what to change:

```
node bin/genai-eval-check.js --explain fact-missing
node bin/genai-eval-check.js --list-checks
```

To show each case as a test in a build system:

```
node bin/genai-eval-check.js cases.jsonl --format junit > junit.xml
```

`examples/` holds two made-up evaluation sets of a fictional insurer, Acme Insurance. The good one, in `examples/good`, passes
at error, warning and info level: thirteen cases in five categories (motor, home, travel, claims and boundaries), with the
facts, alternatives, forbidden phrases, sources on example.com and `doc:` ids, markers, a prefix in the allowed sources, a
length limit and two refusals that a system should make. The bad one, in `examples/bad`, holds a mistake of every check but
`file-unreadable`, which fires only on a file the reader cannot follow: a line that stops half way, a line that is a list and
one nested too deep, a record with no id and one with an empty answer, a misspelt field, a `must_refuse` of "maybe" and a
`max_chars` of "ten", an id written twice, an empty question, a case with nothing to look for, missing facts, an answer that
holds a forbidden phrase, a source outside the allowed set and one with no source, a question that should have been refused
and was answered and one that should have been answered and was refused, an answer that runs on, a seed phrase and a key in
hex that are made up, an email address, a phone number and a card number from the published test set, and four categories
below their pass rate.

## Usage

```
genai-eval-check <cases file> [options]
genai-eval-check --list-checks
genai-eval-check --explain <id>
```

```
--format <name>            text, markdown, json, sarif or junit (default: text)
--json                     the same as --format json
--min-severity <level>     the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>          the lowest level of a finding that fails the run: info, warning, error (default: error)
--min-pass-rate <percent>  the share of the cases of a category that must pass, from 0 to 100 (default: 90)
--category-min <key=value> a minimum for one category, such as billing=95; may be given more than once
--strip-punctuation        take punctuation out of the answer and the phrases before they are compared
--refusal-phrases <file>   a file of phrases, one on each line, that mean a refusal; it replaces the default list
--max-chars <number>       the most characters an answer may have when its case sets no max_chars
--allow-email-domains <list>
                           domains, separated by commas, whose email addresses an answer may hold
--list-checks              list the checks with their level and kind, and exit
--explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
--help                     show the usage
--version                  show the version
```

[docs/inputs.md](docs/inputs.md) lists every field the tool reads, how a list is written in JSON and in a cell, how sources
and refusals are read, and a short file that passes every check. The path in the report is relative to the folder you run the
command in, with forward slashes on every system, followed by the line. For a table, the line is the line of the answer cell.

The report of the bad example starts with what was read, the findings in one line, the pass rate of each category, and the
checks with the number of findings of each; then the findings, errors first, each with what to change:

```
genai-eval-check: examples/bad/cases.jsonl
file: examples/bad/cases.jsonl (JSONL, 22 lines, 4,336 bytes)
records: 22 (15 evaluated, 7 records left out)
cases: 15 evaluated, 7 pass, 8 fail; pass rate 46.7 percent
settings: minimum pass rate 90 percent; punctuation kept; refusal phrases: default list
findings: 27 (24 error, 3 warning)

Categories (6)

  category       cases  pass  fail  pass rate  minimum
  motor          3      1     2     33.3%      90% (below)
  home           3      1     2     33.3%      90% (below)
  travel         3      0     3     0.0%       90% (below)
  claims         3      2     1     66.7%      90% (below)
  (no category)  1      1     0     100.0%     90%
  boundaries     2      2     0     100.0%     90%

A case passes when it has no finding of a check about cases at the error level. The pass rate is the cases that pass over the cases evaluated, rounded to one decimal; it is compared with the minimum exactly.

Checks (18)

  check                              level    kind      findings
  file-unreadable                    error    input     0
  record-unreadable                  error    input     3
  field-missing                      error    input     2
  field-unknown                      error    input     1
  field-invalid                      error    input     2
  id-duplicate                       error    input     1
  question-empty                     error    input     1
  case-checks-nothing                warning  case      2
  fact-missing                       error    case      3
  source-not-allowed                 error    case      1
  source-missing                     error    case      1
  forbidden-phrase                   error    case      1
  refusal-expected-but-answered      error    case      1
  answered-expected-refusal-instead  error    case      1
  answer-too-long                    error    case      1
  secret-like                        error    case      1
  pii-like                           warning  case      1
  category-pass-rate-below           error    category  4
```

Two of the findings of the bad example, as the report shows them:

```
  ERROR    fact-missing                       examples/bad/cases.jsonl:2
           The case "motor-002" misses 2 expected facts: "standard excess is 250" and "windscreen".
           fix: Check the answer for the fact. If the answer says it in other words, add the wording to the group in any_of; if the fact is wrong, correct it.
```

```
  ERROR    secret-like                        examples/bad/cases.jsonl:9
           The answer of the case "claims-001" holds 2 things shaped like a secret: a seed phrase at character 46 and a private key in hex at character 159. The values are not shown.
           fix: Treat the string as exposed if it is real: remove it from the answer and from every place the file was copied to, and make the system stop printing it. If it is a made-up value, change it.
```

The end of the report holds the notes, if any, the notice and the result:

```
This report is deterministic string checking of answers that are already in the file. It never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model.

RESULT: FAIL - 24 findings at or above error (24 error, 3 warning)
```

The good example passes:

```
genai-eval-check: examples/good/cases.jsonl
file: examples/good/cases.jsonl (JSONL, 13 lines, 4,336 bytes)
records: 13
cases: 13 evaluated, 13 pass, 0 fail; pass rate 100.0 percent
settings: minimum pass rate 90 percent; punctuation kept; refusal phrases: default list
findings: 0

Categories (5)

  category    cases  pass  fail  pass rate  minimum
  motor       3      3     0     100.0%     90%
  home        3      3     0     100.0%     90%
  travel      2      2     0     100.0%     90%
  claims      2      2     0     100.0%     90%
  boundaries  3      3     0     100.0%     90%

A case passes when it has no finding of a check about cases at the error level. The pass rate is the cases that pass over the cases evaluated, rounded to one decimal; it is compared with the minimum exactly.
```

```
  none

This report is deterministic string checking of answers that are already in the file. It never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model.

RESULT: PASS - no finding at or above error
```

The output of both examples in all five formats, the list of checks, and the explanation of a check are saved in
`examples/output`.

## How the file is read

1. The path is resolved against the folder you run the command in. A link, a folder, a device or a file over 16 MB is refused,
   and so is a file that is not UTF-8 (or UTF-16 with a byte order mark) or holds a null byte, with exit code `2` and no
   report.
2. A file whose first character that is not white space is `{` is read as JSON Lines, one object on each line; anything else is
   read as CSV, or as TSV when its first line has tabs, whatever the name of the file. The table reader keeps the line and
   column of every cell, follows double quotes and a line end inside a quoted cell, and refuses a quote that is never closed,
   text after a closing quote and a first line separated by semicolons.
3. A line nested more than four levels deep is refused before it is parsed. A line that is not JSON, or is not an object, is
   reported with its line and its text is never shown.
4. A field is found by its name with case and separators ignored. A field the tool does not read is an error with the nearest
   name. A record with no id, no answer (an empty answer counts as missing), a field of the wrong type or a list over 1,000
   entries is left out, reported and counted; an id used twice leaves the later record out.
5. Each case is checked: refusal phrases, facts and alternatives, sources, forbidden phrases, the refusal rule, length, secrets
   and personal data. Then the cases that pass are counted in each category and compared with the minimum.

[docs/method.md](docs/method.md) says what each check reads, and [docs/inputs.md](docs/inputs.md) lists the fields.

## What it checks

| Check | Level | Kind | What it reports |
| --- | --- | --- | --- |
| `file-unreadable` | error | input | the file is not JSON Lines or a table the reader can follow (a quote never closed, text after a closing quote, a cell too long, semicolons for commas, a list in place of lines), or holds no records, so nothing in it was checked |
| `record-unreadable` | error | input | a line that is not valid JSON, not an object, nested too deep or with too many fields, or a table row with more or fewer cells than the header; the record was left out of the evaluation |
| `field-missing` | error | input | a record with no id or no answer (an empty answer counts as missing), or a header without an id or an answer column; the record was left out |
| `field-unknown` | error | input | a field or a column the tool does not read, often a misspelt name; nothing under it was checked |
| `field-invalid` | error | input | a field of the wrong type (a number where a list is read, a must_refuse that is not yes or no, a max_chars that is not a whole number), a list or a phrase over the limit, two fields with the same name, or a forbidden phrase with nothing left once normalized; the record was left out |
| `id-duplicate` | error | input | two records with the same id, compared without regard to case and runs of white space; the second record was left out |
| `question-empty` | error | input | a record whose question is empty or missing; the answer is still checked |
| `case-checks-nothing` | warning | case | a case that lists no expected fact, no group of alternatives, no forbidden phrase, no allowed source, no max_chars and no required refusal, and has no --max-chars to fall back on; it can only fail the search for secrets and personal data |
| `fact-missing` | error | case | an expected fact, or a group of alternatives of which none appears, is not in the answer; every missing fact is listed |
| `source-not-allowed` | error | case | the answer cites a source outside the allowed set: a web address or a document id that is not in allowed_sources, or a marker such as [3] that sources does not explain |
| `source-missing` | error | case | allowed_sources is given and the answer cites nothing, neither in cited_sources nor in its text; a case that expects a refusal is left out of this check |
| `forbidden-phrase` | error | case | the answer holds a phrase from the forbidden list; every phrase found is listed with how many times |
| `refusal-expected-but-answered` | error | case | must_refuse is yes and the answer holds none of the refusal phrases, so the system answered a question it should have declined |
| `answered-expected-refusal-instead` | error | case | must_refuse is no or empty and the answer holds a refusal phrase, so the system declined a question it should have answered |
| `answer-too-long` | error | case | the answer has more characters (Unicode code points) than the max_chars of the case, or than --max-chars when the case sets none |
| `secret-like` | error | case | the answer holds a string shaped like a private key, a seed phrase, an access key id, a token or a password written as an assignment; only the kind and the position are reported, never the value |
| `pii-like` | warning | case | the answer holds something shaped like an email address, a phone number or a card number that passes the Luhn check; only the kind and the position are reported, never the value |
| `category-pass-rate-below` | error | category | the share of the cases of a category that pass (no error-level finding of a case) is below --min-pass-rate (default 90 percent) or below the --category-min of the category, compared exactly |

A check of the input is about the file, a record, a field or an id, a check of a case is found from the answer of one case,
and a check of a category counts the cases of a category. Each check is a best practice of this tool and says so in its reason
(`--explain <id>`). Errors are cases or records that fail, and a category below its pass rate; warnings are things a reader
should see before trusting the rate. [docs/method.md](docs/method.md) describes every check with what it cannot see.

## What is not checked

- Whether an answer is true. A fact is a phrase that is found or not found; the tool does not read negation, hedging or
  meaning, and `excess is 250` is found in "it is not true that the excess is 250".
- Other wordings. An answer that says "thirty days" does not hold "30 days". Both wordings go in `any_of`; looser matching
  would pass answers nobody has read.
- Whether the facts in the file are right. The tool trusts the file; a wrong expected fact fails a right answer.
- Whether a citation supports its sentence. A source in an answer is only text and is never opened.
- How the answer was produced: the prompt, the documents the system read, the model, the settings. The tool never calls a
  model and sees only the saved text.
- Whether the cases are the questions that matter. A pass rate is the rate over the cases written, not over real traffic.
- Secrets and personal data of shapes other than the few it knows (docs/limits.md), and anything outside the answers.

## Formats

`--format text` (the default) is for a terminal. `--format markdown` is for a job summary or a pull request and escapes what
markdown gives a meaning to. `--json` (or `--format json`) gives one object with the file, the summary and the pass rate of
each category, every case with its findings, every check with its number of findings, every finding with its id, level, kind,
file, line, column, message, fix and subject, the notes and the result. `--format sarif` gives SARIF 2.1.0 for code scanning,
with one result for each finding and its line and column. `--format junit` gives JUnit XML: a test suite for each category
with a test for each case (a failure lists the findings that failed it), a suite for the problems of the input, and a suite
with one test for the pass rate of each category; no time is recorded, because the tool reads no clock. `--list-checks` lists
the checks in text, markdown or JSON, and `--explain <id>` explains one check in the same three forms.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no finding at or above the `--fail-on` level (default `error`) |
| `1` | a finding at or above the `--fail-on` level |
| `2` | a usage error, or an input the tool cannot read at all (no result) |

A finding below `--min-severity` is not shown but still counts for the result.

## Limits

The file is read whole, up to 16 MB. A table has at most 250,000 rows, 40 columns, 3,000,000 cells and 12,000,000 characters in
a cell; JSON Lines has at most 250,000 records, 100 fields and 4 levels of nesting; a list holds at most 1,000 entries and a
phrase at most 1,000 characters, and a list over that makes the record fail instead of being cut. At most 1,000 findings of
one check are listed, and the rest are counted and noted. A run may search at most 8,000,000,000 characters in all, and stops
with exit code `2` past that. The reader, the searches and the checks work through loops and maps and nothing calls itself.
[docs/limits.md](docs/limits.md) says what the tool cannot see.

## Architecture

| File | What it does |
| --- | --- |
| `src/files.js` | the bounded reading of a file: a regular file, no link, UTF-8 or UTF-16 |
| `src/csv.js` | the CSV and TSV reader with the line and column of every cell |
| `src/read.js` | the choice of format, the JSON Lines reader and the fields of a case |
| `src/match.js` | the normalization and the search of a phrase on word edges, with a work budget |
| `src/sources.js` | the sources of an answer, read from its text and compared with the allowed set |
| `src/scan.js`, `src/secrets.js` | the searches for secrets and for personal data in an answer |
| `src/evaluate.js` | the checks of one case |
| `src/rate.js`, `src/decimal.js` | the pass rates and the minimums as exact numbers with BigInt |
| `src/rules.js`, `src/data.js`, `src/fields.js`, `src/collect.js` | the checks with their levels, fixes and reasons, the notice and the fields |
| `src/check.js`, `src/report.js`, `src/cli.js` | a run, the formats and the command line |

## Where the ideas come from

Checking saved answers against a list of questions with what a good answer must hold is a common way to catch a change that
made a system worse, and a build that fails on a pass rate is the usual way to act on it. No standard sets the checks of this
tool, and the tool quotes none. [docs/context.md](docs/context.md) says what plain string checking is good for and where it
misleads.

## Background

This tool is one of the small open source checks that INNERLUXES publishes next to its work on generative models. If you are planning a generative system and want to know how it is built, tested and put to use, the page [Custom Generative AI Development Services and Consulting](https://innerluxes.dev/artificial-intelligence/generative-ai) covers that work and points to this tool.

## License

MIT. See [LICENSE](LICENSE).
