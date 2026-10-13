# Method

genai-eval-check is deterministic string checking of answers that are already in a file. This document says what each step
reads, in which order the work is done, and what each of the 18 checks looks at and cannot see. No standard sets any check;
every one is a best practice of this tool, and `--explain <id>` says so.

## The order of the work

1. **Read the file** through the bounded reader: a regular file of at most 16 MB, UTF-8 or UTF-16, no link followed.
2. **Pick the format** from the first character that is not white space: `{` is JSON Lines, `[` is refused, anything else is a
   table (docs/inputs.md).
3. **Read the records.** Each line or row becomes a case, or a finding and no case. A record that is not JSON, is nested too
   deep, has the wrong number of cells, has no id or no answer, has a field of the wrong type or a list over the limit, or
   repeats an id, is left out and reported. An unknown field is reported and the case is still read.
4. **Check each case** in this order: the refusal phrases, the expected facts and alternatives, the sources, the forbidden
   phrases, the refusal rule, the length, secrets, personal data, and whether the case checks anything at all.
5. **Count** the cases that pass in each category. A case passes when it has no finding at the error level from a check about
   cases. Findings about the input (a bad line, an unknown field, an empty question) do not fail the case they belong to; they
   fail the run through `--fail-on`.
6. **Compare** each category's pass rate with the minimum, exactly, and report the categories that fall below it.
7. **Write the report** in the format asked for, and exit `0`, `1` or `2`.

## Normalization

An answer, an expected fact, an alternative, a forbidden phrase and a refusal phrase are all normalized the same way before
they are compared:

1. Unicode NFKC (full-width letters, ligatures and no-break spaces become their plain forms);
2. `String.prototype.toLowerCase()`, which does not depend on the locale (this is lower casing and not full case folding, so a
   German sharp s stays as it is);
3. typographic single quotes and apostrophes written as `'`, typographic double quotes written as `"`;
4. with `--strip-punctuation`, every run of punctuation (Unicode category P) replaced by a space;
5. every run of white space replaced by one space, and the ends trimmed.

## Finding a phrase

A normalized phrase is looked for in the normalized answer as a run of characters. It counts as found only on word edges: if
its first character is a letter, a digit or an underscore, the character before it in the answer must not be one, and the
same for its last character and the one after. A number also does not start or end inside a longer number written with a
point or a comma, so `250` is not found in `2,500`, `1.250` or `250.50`, but is found in `pay 250.` and `pay 250, then`. A
phrase that starts or ends with a symbol (`$250`, `20%`, `(see below)`) needs no edge on that side. Nothing else is done: no
stemming, no synonyms, no edit distance and no meaning.

## The checks

**About the input** (the case it belongs to is not counted against):

- `file-unreadable`: the file is empty, starts with a list, has a header and no rows, or is a table the reader cannot follow
  (a quote never closed, text after a closing quote, a cell over 12,000,000 characters, semicolons for commas). Nothing is
  checked.
- `record-unreadable`: a line that is not valid JSON, is not an object, is nested deeper than 4 levels or has more than 100
  fields, or a row with more or fewer cells than the header. The text of the line is never shown; a position is.
- `field-missing`: a record with no `id`, or with no `answer` or an answer of only white space; or a header without an `id` or
  an `answer` column (one finding, and nothing is checked).
- `field-unknown`: a key or a column the tool does not read, with the nearest name when one is within two edits.
- `field-invalid`: a value of the wrong type or past a limit, a key or a column that is the same field as an earlier one, and
  a forbidden phrase with nothing left once normalized.
- `id-duplicate`: an id already used by an earlier record; the later record is left out.
- `question-empty`: a record with an empty or missing question.

**About one case:**

- `case-checks-nothing`: nothing to look for (warning).
- `fact-missing`: an expected fact is not in the answer, or no phrase of an `any_of` group is. One finding for the case lists
  every missing fact. Skipped when `must_refuse` is `yes`.
- `source-not-allowed`, `source-missing`: see docs/inputs.md. Skipped when `allowed_sources` is empty or `must_refuse` is `yes`.
- `forbidden-phrase`: each forbidden phrase found, with the number of times (counted up to 1,000).
- `refusal-expected-but-answered`, `answered-expected-refusal-instead`: the refusal rule above.
- `answer-too-long`: more characters (Unicode code points) than `max_chars`, or than `--max-chars` when the case sets none.
- `secret-like`: see docs/limits.md for the shapes. Only the kind and the 1-based character position are reported.
- `pii-like` (warning): an email address, a phone number or a card number. Only the kind and the position are reported.

**About a category:**

- `category-pass-rate-below`: the share of evaluated cases in a category that pass is below the minimum, which is
  `--min-pass-rate` (default 90 percent) or the `--category-min` of that category. A category is its text compared without
  regard to case and runs of white space; cases with no category are one category called `(no category)`.

## The arithmetic of the pass rate

The pass rate is `passed / evaluated`, kept as two whole numbers (BigInt). The minimum is read from its characters as a plain
decimal from 0 to 100 and the two are compared by cross multiplication: a category is below the minimum when
`passed * 100 * 10^scale < minimum_integer * evaluated`. Nothing is rounded for a comparison, so 9 of 10 is exactly 90 percent
and 899 of 1,000 is below it. A rate is rounded to one decimal, half up, only when it is shown. No floating point number is
used anywhere.

## What counts as evaluated

A case is evaluated when its record was read: it has an id that is not a repeat and a non-empty answer, and every field it has
could be used. Records that were left out are counted and shown (`records: 22 (15 evaluated, 7 records left out)`), they are
not in any pass rate, and each one is an error finding, so the run fails at the default `--fail-on` whatever the rates are.
