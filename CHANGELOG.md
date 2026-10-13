# Changes

## 1.0.0

First release.

- Checks answers that a generative system already gave, as deterministic string checking: reads a file of cases (JSON Lines,
  or CSV or TSV with a header row) with an id, a category, a question, the answer, expected facts, alternatives, forbidden
  phrases, allowed and cited sources, whether the right answer is a refusal and a length limit, and lists with its line what
  does not hold. The tool never calls a model, it does not judge whether an answer is true beyond the facts and phrases the
  file lists, and it is not a full evaluation of a model. It reads the file, contacts nothing over the network, opens no
  source, needs no key, follows no symbolic link, reads no clock and writes nothing to disk.
- Thirteen fields that the tool names itself (no standard fixes them), documented in docs/inputs.md: `id`, `category`,
  `question`, `answer`, `expected_facts`, `any_of`, `forbidden`, `allowed_sources`, `cited_sources`, `sources`, `must_refuse`,
  `max_chars` and `note`. A field is found by its name with case and separators ignored. Lists are JSON lists or `;` lists in
  a cell, and groups of alternatives use `|`.
- Matching by plain string rules, documented in docs/method.md and docs/decisions/0001: Unicode NFKC, lower case, typographic
  quotes written as plain ones, white space collapsed, optional `--strip-punctuation`, and phrases found on word edges (a
  number is not found inside a longer number). No fuzzy or semantic matching.
- Citations read from the answer when the file does not list them: web addresses, `doc:` ids and markers such as `[2]` that
  `sources` explains; compared with the allowed set as text, with `*` for a prefix. Refusals found by a configurable list of
  phrases (`--refusal-phrases`).
- Eighteen checks in three levels, each marked as a check of the input, of a case or of a category, each a best practice of the
  tool and saying so: seven about the input (`file-unreadable`, `record-unreadable`, `field-missing`, `field-unknown`,
  `field-invalid`, `id-duplicate`, `question-empty`); ten about a case (`case-checks-nothing`, `fact-missing`,
  `source-not-allowed`, `source-missing`, `forbidden-phrase`, `refusal-expected-but-answered`,
  `answered-expected-refusal-instead`, `answer-too-long`, `secret-like`, `pii-like`); and one about a category
  (`category-pass-rate-below`).
- Secrets and personal data in answers are reported by kind and position only, never by value: the search for keys and seeds of
  the sibling tools plus seed phrases, key blocks, access key ids, tokens and passwords written as assignments; email
  addresses, phone numbers and card numbers that pass the Luhn check. `--allow-email-domains` lets chosen domains through.
- A pass rate for each category and overall, with exact arithmetic: two whole numbers compared with the minimum by cross
  multiplication (BigInt), rounded half up to one decimal only when shown. `--min-pass-rate` (default 90 percent) and
  `--category-min category=percent`.
- Reports as text, markdown, JSON, SARIF 2.1.0 and JUnit XML (a suite for each category with a test for each case); every
  finding has its id, severity, kind, message, file, line, column and subject; `--min-severity`, `--fail-on`, `--max-chars`,
  `--list-checks` and `--explain <id>`. Exit code `0` when no finding is at or above the fail-on level, `1` when one is, `2`
  for a usage or input error, with no result.
- A strict reader of tables and the bounded reading of a file of the sibling tools, JSON Lines read one line at a time after a
  loop that refuses lines nested deeper than a case can be, limits on records, fields, lists, phrases, citations and the total
  work, and hostile input tests for a hundred thousand cases, an answer of ten million characters, a million facts and
  deeply nested JSON.
- Made-up examples: an evaluation set of a fictional insurer that passes at every level and one with a mistake of every check
  but `file-unreadable`, with their real output in every format, the list of checks and the explanation of a check.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of
  the repository.
