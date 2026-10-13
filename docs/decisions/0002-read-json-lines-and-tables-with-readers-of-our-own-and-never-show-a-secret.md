# 2. Read JSON Lines and tables with readers of our own, and never show a secret

## Status

Accepted

## Context

The answers of a system are the least trusted text a tool of this kind reads. They can hold anything the system saw or was
told to say, including a key from a document it retrieved, a customer's email address or a card number. A report that copies
a fragment of such an answer into a log or a pull request comment turns the checker into the leak.

The file can also be hostile or only careless: a line nested a hundred thousand levels deep, an answer of ten million
characters, a row with a comma too many, a record with no id. Reading it with a general parser and trusting what comes out
would let a malformed record disappear into a better pass rate.

## Decision

1. JSON Lines is parsed one line at a time with the parser of the platform, after a loop that counts the nesting outside texts
   and refuses a line deeper than a case can be, so no deep structure reaches the parser. The text of a line that is not JSON
   is never put in a message; its position is.
2. Tables are read by the strict reader of the sibling tools (`src/csv.js`), kept unchanged: it follows RFC 4180 quoting with a
   comma or a tab, keeps the line and column of every cell, works through a loop with no recursion and refuses what it cannot
   follow instead of guessing.
3. Every record that cannot be read or used is an error finding at its line and is left out of the evaluation, never read as
   something else. It is counted in the summary, so a pass rate is never shown without the number of records behind it.
4. A list or a phrase over the limit makes its record fail. It is never cut, because a cut list could let a case pass.
5. The search for secrets reuses the shapes and the code of the sibling tools (`src/secrets.js`, unchanged) for keys in hex,
   extended keys and keys in WIF, and adds the shapes of seed phrases, key blocks, access key ids, tokens and passwords written
   as assignments. It reports the kind and the 1-based position of each place and never the value. Email addresses, phone
   numbers and card numbers that pass the Luhn check are reported the same way.
6. Every text from the input goes through `safeText` before it reaches a report, and each format escapes what it gives a
   meaning to.

## Consequences

- A report can be pasted into a pull request without copying a secret.
- The shapes are loose and few; docs/limits.md says what is not found. A 64-digit hex checksum in an answer is read as a key.
- The tool needs no dependency to read its input, and a failing line is always pointed at.
