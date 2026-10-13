# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "genai-eval-check security", or use private vulnerability reporting on this
repository. Please do not open a public issue for a vulnerability.

Include a small made-up file that shows the problem, the command you ran, what you expected and what happened. Use made-up
questions, answers and companies, never answers from a real system, the name of a real customer, or a real key, seed phrase,
token, email address, phone number or card number, even an old one or one from a test account.

## Scope

The tool is deterministic string checking of answers that are already in a file. It never calls a model, it does not judge
whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model. In scope:

- an input that makes the tool show a secret or personal data from an answer, or any part of one, in a report or an error
  message, in any format, instead of only its kind and position
- a string in one of the shapes docs/limits.md names that the tool does not report
- an input that makes the tool read a file other than the ones it was given, or follow a symbolic link
- an input that makes the tool open a network connection, call a model, fetch a URL, open a source written in a case, write or
  sign anything, run any other program, or evaluate anything it reads
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large file, a
  hundred thousand cases, an answer of ten million characters, a list of a million facts, a line nested a hundred thousand
  levels deep, a cell of a million characters, a row of a million commas, long runs of quotes, or an answer built to make a
  search slow
- binary or invalid input that the tool reads as if it were a set of cases
- a record that is skipped without an error finding and without being counted as left out, a list that is read in part, a
  field the tool does not read that is not reported, or a row of the wrong width that is read as if it were right
- a case that docs/method.md says is reported (a fact missing, a forbidden phrase, a source outside the allowed set, a refusal
  that is wrong, an answer too long, a secret, a category below its pass rate) that the tool does not report
- a pass rate that is not the exact value worked out from the cases, or a comparison with the minimum that is decided by
  rounding
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, is shown unescaped in the
  output, puts markup into the markdown report, or breaks the XML of the JUnit report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the shapes docs/limits.md says the tool does not see, whether the answers are true (a clean result says nothing
about the system), whether a source is what the file says, who may change or upload the file, and where your pipeline keeps
the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
