# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest of
the document is about what the tool cannot do for you: which file you give it, where the output goes, and who may change the
file it reads. A clean result is a file of answers with none of the problems the checks look for, not a finding that the
answers are true: the tool is deterministic string checking of answers that are already in the file, it never calls a model,
and it is not a full evaluation of a model.

## How the tool behaves by default

- **Never a model, never a key.** The tool needs no API key, no address of a server and no account, and has no option to take
  one. It cannot call a model, because it has no code that reaches the network.
- **Reads, never writes.** The tool reads the file it is given, and the file of refusal phrases when you name one. It follows
  no symbolic link, fetches no URL, refuses an argument that looks like an address, contacts nothing over the network,
  evaluates nothing, runs no program and writes nothing to disk. A source written in an answer is text and is never opened.
- **Secrets and personal data are never echoed.** A string in an answer that looks like a key, a seed phrase, a token, an
  email address, a phone number or a card number is reported by its kind and its position, and its value is never put in a
  text, markdown, JSON, SARIF or JUnit report or in an error message.
- **Every check on from the first run.** A file the reader cannot follow, a record that cannot be read or used, a missing fact,
  a source outside the allowed set, a forbidden phrase, a refusal that is wrong, an answer too long, something shaped like a
  secret and a category below its pass rate are errors; a case that checks nothing and something shaped like personal data are
  warnings. There is no configuration file of the tool that could set a check off.
- **No record is skipped without a word.** A record that is left out is an error finding at its line and is counted in the
  summary, and the run fails at the default `--fail-on` of `error`. A list over the limit makes the record fail; it is never
  cut.
- **No clock.** The tool reads no date and no time. The same input and options give the same report on every day, and the
  JUnit report records every time as 0.
- **Fail closed on what it cannot read.** A file that is not JSON Lines or a table the reader can follow is an error finding
  that fails the run. A file that is not text, is too large or is a link stops the run with exit code `2` and no report.
- **Exact rates.** A pass rate is two whole numbers; the comparison with the minimum is exact and a rate is rounded only when it
  is shown.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option given
  twice (but `--category-min`, which is a list) stop the run, so a typo such as `--fail-no` cannot leave a default in place. A
  threshold that is not a plain number in its range is refused.
- **No pattern from the input.** No regular expression is built from a file or from an argument.
- **Bounded work.** The reader has limits of size, records, fields, nesting, list length and phrase length, the searches are
  loops, and a work budget stops a run that would search more than the limit (docs/limits.md), so a large or hostile file
  cannot exhaust the stack, the memory or the time.
- **No prototype tricks.** Names from the file are kept in maps and sets and compared with the names the tool reads, never set
  as properties of an object, so `__proto__` is only a name.
- **Clean output.** Text from the input, file names, ids and categories included, has control characters, line separators and
  direction controls replaced and its length capped before it reaches a report or an error message; the markdown report also
  escapes what markdown gives a meaning to, and the JUnit report escapes XML.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--fail-on warning`.** A case that checks nothing and something shaped like personal data fail the run too. Use it on the
  set that is about to gate a release, and record each warning the team keeps on purpose.
- **`--min-pass-rate` and `--category-min`.** Raise the minimum for the categories that matter. A minimum of 100 means that
  one failing case fails the run.
- **`--max-chars`.** Set the longest answer a case may have when it does not set its own.
- **Whole sets.** Check the whole set at once; a set cut in the middle changes the pass rates.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@<full commit hash> # vX.Y.Z
  - uses: actions/setup-node@<full commit hash> # vX.Y.Z
    with:
      node-version: 22
  - name: Check the saved answers
    run: npx --yes github:INNERLUXES/genai-eval-check answers/cases.jsonl --min-pass-rate 95 --format junit > answers/junit.xml
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no API key and no access to a server;
  never give it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx`
  runs what it downloads.
- Run the system that produces the answers in a step of its own, with its own keys, and save its answers to the file. This
  tool only reads that file.
- Check the exact file that the next step uses. A file edited after the check is not what was checked.
- Keep the file out of public repositories if the answers hold anything of your customers or your documents. Keep the reports
  with the same care, because a finding quotes ids, facts and categories of the file.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error` and
  keep the JUnit, SARIF or JSON report as an artifact of the job.
- Treat a report built from a file you do not trust as untrusted data.
- If the tool reports `secret-like` and the value is real, treat it as exposed: remove it from the file and from every place
  the file was copied to, make the system stop printing it, and move what it controls to a new key. The tool does not show the
  value, but the file itself was readable to everyone with access to it.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
