# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows
and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the
repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!`
for a breaking change.

This tool reads a file of cases and runs nothing. It is deterministic string checking of answers that are already in the
file, it never calls a model, and it is not a full evaluation of a model. A change must keep it that way: a check reports
what the file holds, and the tool never contacts anything over the network, never writes, submits or signs anything, and
never fetches, opens, runs or evaluates what it reads.

## Never a secret, never a real answer

The tool never asks for a key and never looks up a source. Do not add an option, a field or a test that gives it one. A test
of the search for secrets builds its values from repeated characters or from pieces joined at run time (see test/scan.test.js),
so that no file of the repository holds anything that could be a real key, token or seed phrase, and none of them has the
shape of a token of a code host. Never paste answers from a real system, the name of a real customer, a key, a seed phrase, an
email address, a phone number or a card number into an issue, a pull request or an example. Use made-up companies (Acme
Insurance and its kin), made-up policies, addresses on example.com, and the card numbers of the standard published test set.

## Never a fuzzy match, never a judgement

Every check is a best practice of this tool, and says so in `own` in src/rules.js. No standard sets any of them. Matching is
plain string work (docs/decisions/0001): do not add stemming, synonyms, an edit distance, a similarity score or a call to a
model. Do not write a message, a document or an example that reads as a statement that an answer is true, that a system is
safe or good, or that the tool evaluates a model.

## Changing a check

1. Describe the change in docs/method.md first: what the check looks at and what it can and cannot see, and add what it cannot
   see to docs/limits.md. Say in `own` in src/rules.js, and in the message, that it is a best practice of the tool, and why the
   tool asks for it.
2. Keep the checks to what is written. A finding must point at something a reader can check in the file: a line and a column.
   Never add a check that needs the network, a registry, a key or the clock.
3. A check says what to change, in `fix` in src/rules.js, what it cannot see, in `cannot`, and is marked as a check of the
   input, of a case or of a category in `kind`.
4. A run must never pass because something could not be read: a file that is not cases is an error finding, and a record that
   cannot be read or used is a finding that names it and is counted as left out.
5. Add a test with the cases written inline (`kase()`, `jsonl()`, `table()`, `findingsOf()`, `idsOf()`, `ofCheck()`, `runOf()`,
   `run()` and `cli()` in test/helpers.js), small enough to work out by hand, with a near miss on each side: the value that is
   reported and the one next to it that is not.
6. A check id, once released, keeps its meaning: pipelines and other tools read it from the JSON, SARIF, JUnit and markdown
   output.

## Changing the reader and the arithmetic

1. The reader of tables (src/csv.js) keeps its limits (`CSV_LIMITS`; the tool passes its own in `TABLE_LIMITS`) and works
   through a loop; it has no recursion, and neither has the search for secrets (src/secrets.js and src/scan.js). The decimal
   reader (src/decimal.js) keeps `DECIMAL_LIMITS`. src/csv.js, src/decimal.js, src/files.js, src/secrets.js, src/size.js and
   src/text.js are kept as they are in the sibling tools; a test compares their hashes.
2. A pass rate and a minimum are whole numbers and a decimal read from the characters of the text, with BigInt. Comparisons are
   exact; a number is rounded only when it is shown. Never use a floating point number for a rate.
3. A secret or a piece of personal data is reported by its kind and its position only; no message may carry the value.
4. A field that is read is listed in docs/inputs.md and in src/fields.js; a record that cannot be used is a finding, so that it
   never goes by unnoticed.
5. No pattern is built from a file or an argument. A test fails when `new RegExp` appears in src outside src/text.js.
6. Nothing walks every pair of cases, and no function calls itself (decision 4). Hostile tests with a hundred thousand cases,
   an answer of ten million characters and a list of a million facts check it.
7. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when
   coverage is on, and allow four times the time (`allowed()` in test/helpers.js). Run `npm run test:coverage` before you open
   the pull request.
8. A file written with LF, CRLF or CR line ends, as UTF-8 with or without a byte order mark or as UTF-16 with one, must give
   the same findings.

## The examples

The files under `examples/` are made-up input for the tool: an evaluation set that passes at error, warning and info level,
and one that holds a mistake of every check but `file-unreadable`, with made-up companies, sources on example.com, made-up
secrets that are not shaped like the token of any code host, addresses on example.com, and no date. A change to them goes with
the real output that `npm run example` writes to `examples/output`.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device, a control character in a file name) is guarded with
`process.platform` and says why in its `skip`. A test never asserts a line number written by hand for one system: a line is
worked out with `lineOf()` of test/helpers.js or from the text itself. Every other test builds its paths with `resolve()` from
names with forward slashes, and a test never writes a backslash, a bar, a star, a question mark or a quote into a file name,
because Windows refuses them.

A test never reads the clock, the time zone of the machine or the locale. A test never asserts the hash or the version of a
GitHub Action: Dependabot changes them, and the test checks only that each action is pinned to a full commit with a version
comment.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network connection,
  calls no model, opens no source, signs nothing, runs no program and evaluates nothing it reads.
- Text from the input, file names, ids and categories included, goes through `safeText` before it reaches the output or an
  error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No file carries a date in its prose, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0),
  counts, seconds and the number of a standard (SARIF 2.1.0, NIST SP 800-218) are fine.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
