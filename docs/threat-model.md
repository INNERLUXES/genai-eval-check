# Threat model

genai-eval-check is deterministic string checking of answers that are already in a file. It never calls a model, it does not
judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model. This
document is about the tool itself: what it touches, what a hostile or careless file can try, and what stops it.

## What the tool touches

- It reads the cases file named on the command line and, when `--refusal-phrases` is given, the one file of phrases named
  there. Nothing else is opened, and no path, address or source written in a case is looked up, opened or followed; a web
  address in an answer is only text.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, calls no model, fetches no URL, follows no symbolic link, runs nothing it reads, evaluates
  nothing and reads no clock and no locale.

## What the input may hold

A file of cases comes from a person, from a colleague, or from a system run that saved what a model said. In a pipeline that
checks every pull request, it can come from whoever sent the pull request. The answers in it are text written by a model and
are as untrusted as any text from outside. Through the file, a person can try to, or a careless run can:

- put a key, a seed phrase, a token, an email address or a card number in an answer, so that the tool copies it into a
  pipeline log, a pull request comment or a code scanning upload;
- make the tool read outside the files: a link named on the command line, a folder, an address given as the path;
- exhaust the memory, the stack or the time: a file of many megabytes, a hundred thousand cases, an answer of ten million
  characters, a list of a million facts, a line nested a hundred thousand levels deep, a row of a million commas, quotes in
  long runs, an answer of one letter or of numbers and at signs built to make a pattern slow;
- move the result: a field written twice so that two readers see two values, a misspelt field that hides a list of facts, a
  record that is skipped without a word so that the pass rate rises, an id used twice so that the later answer wins, a list cut
  short so that a fact is never looked for;
- slip in something that is not text: a binary file, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, escape sequences, direction controls and line separators in an
  id, a category, a message or a file name; characters that XML 1.0 cannot hold in the JUnit report;
- hide markup in the markdown report: a link, a table separator or a tag in an id or a category;
- change how objects behave: a field, an id or a category named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A secret or personal data in an answer is copied into the output | Only the kind and the 1-based position of what was found are put in a message; the value is never kept. A test puts each shape in an answer and checks every format for the value |
| A record is skipped quietly and the pass rate rises | Every record that cannot be read or used is an error finding at its line (`record-unreadable`, `field-missing`, `field-invalid`, `id-duplicate`) and is counted as left out in the summary; the run fails at the default `--fail-on` |
| A misspelt field hides a list of facts | A field the tool does not read is a `field-unknown` error with the nearest name; a case with nothing to look for is `case-checks-nothing` |
| A list is cut and a fact is never looked for | A list over 1,000 entries, or a phrase over 1,000 characters, makes the record `field-invalid` and left out; the tool never reads a part of a list |
| A link makes the tool read a file it was not given | The path is checked with `lstat` and a link is refused by name; the file is opened with `O_NOFOLLOW` where the system has it, and its type and size are taken from the open handle. A test puts a link in the folder |
| The tool reaches a server, calls a model or runs something | No module of the network or of child processes is imported, nothing is evaluated, a source is only text, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Each file has a size limit checked on the open handle before it is read; the reader of tables keeps limits and works through a loop; JSON is refused when nested deeper than 4 levels before it is parsed, by a loop that counts brackets outside texts; no pattern has nested repeats, the searches for emails and numbers are loops with bounded steps, and a work budget stops a run that would search more than 8,000,000,000 characters. Tests with the shapes above check the time, with limits that widen under coverage only |
| A pattern built from the input runs for ever | No regular expression is built from a file or from an argument |
| A duplicate id lets a later answer win | The later record is left out and reported; the first one is the one counted |
| The pass rate is rounded across the minimum | Rates are two whole numbers (BigInt); the minimum is compared by cross multiplication and rounding happens only when a rate is shown |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes in UTF-16 and bytes that are not valid make the file an input error with exit code `2` and no report |
| Text from a file rewrites the terminal | Every text from the input goes through `safeText`, which replaces control, line separator and direction characters and caps the length. A test puts escapes and direction controls in an id and a category, in every format |
| Markup in an id changes the markdown report | The markdown report escapes the characters markdown gives a meaning to. A test writes a link, a bar and a tag into an id |
| The XML report is not well formed | The JUnit report escapes the five characters of XML and replaces the characters XML 1.0 cannot hold. A test writes them into an id and a category |
| `__proto__` changes how objects behave | Names are kept in `Map` and `Set` objects and compared with the names the tool reads; no object is built with a key from a file. A test uses `__proto__`, `constructor` and `toString` as ids, categories and fields |
| The time of the run changes the result | No clock is read, so the same file and options give the same report on every day, and the JUnit report records no time |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the answers are true, whether the facts of the file are right, the shapes docs/limits.md says the tool does not see,
how the answers were produced, who may change or upload the file, and where your pipeline keeps the output.
