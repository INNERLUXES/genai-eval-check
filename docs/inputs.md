# Inputs

genai-eval-check reads one file of cases. Each case holds a question, the answer a system already gave, and what the answer
must and must not contain. The tool never produces an answer and never calls a model: it only checks the text that is in the
file. This document lists the formats, every field, how a list is written, how sources are read, the refusal phrases, and a
short file that passes every check.

## Two formats, found by the first character

- **JSON Lines.** One JSON object on each line. A file whose first character that is not white space is `{` is read this way,
  whatever its name (`.jsonl` is the usual one). Blank lines are skipped and the line numbers still count them. A line may be
  at most 4 levels deep (an object, a list, a list of lists and one more); a deeper line is refused without being parsed.
- **CSV or TSV.** A header row and one row for each case. The delimiter is a tab when the first line has tabs outside quotes and
  at least as many as commas, else a comma. A cell that holds a comma, a tab, a quote or a line end is written in double
  quotes, with a quote inside it written as two. A first line separated by semicolons is refused with a message.

Both are read as UTF-8 (a byte order mark is dropped) or as UTF-16 with a byte order mark, with LF, CRLF or CR line ends. A
file that holds a null byte, is not valid text, is a link, a folder or a device, or is larger than 16 MB, is refused with exit
code `2` and no report.

A field is found by its name with case and separators ignored: `Expected Facts`, `expected-facts` and `expected_facts` are one
field. In JSON Lines the keys of an object are matched the same way.

## The fields

| Field | Needed | What it holds |
| --- | --- | --- |
| `id` | yes | the name of the case, different on every record (compared without regard to case and runs of white space); a whole number is read as text |
| `category` | no | the group the case counts in for the pass rate; empty means `(no category)` |
| `question` | no | the question that was asked; it is never matched, but an empty one is a finding (`question-empty`) |
| `answer` | yes | the answer that was given, as text; it is the only text that is searched. An empty answer counts as a missing one |
| `expected_facts` | no | phrases that must all appear in the answer |
| `any_of` | no | groups of alternative phrasings; at least one phrase of every group must appear |
| `forbidden` | no | phrases that must not appear |
| `allowed_sources` | no | the web addresses and document ids the answer may cite; an entry that ends with `*` allows every source that starts like it |
| `cited_sources` | no | the sources the answer cited; when it is empty or absent they are read from the answer (see below) |
| `sources` | no | what the markers `[1]`, `[2]` and so on of the answer stand for, in order |
| `must_refuse` | no | `yes` when the right answer is a refusal; `no` or empty otherwise. In JSON, `true` and `false` also work |
| `max_chars` | no | the most characters the answer may have, a whole number from 1 |
| `note` | no | free text for the reader; kept, never compared |

A field the tool does not read is a finding (`field-unknown`) and nothing under it is checked. A field with a value the tool
cannot use (a number where a list is read, `must_refuse` of `maybe`, a `max_chars` of `ten`, a list of more than 1,000
entries, a phrase of more than 1,000 characters) is a finding (`field-invalid`) and the record is left out; the tool never
reads a part of a list.

## Lists

- In JSON a list is a JSON list of texts: `"expected_facts": ["within 30 days", "claims form"]`. A text in place of a list is
  read as a `;` list.
- In a CSV or TSV cell a list is separated by `;`: `within 30 days;claims form`. Spaces around an entry and empty entries are
  dropped. An entry that holds a `;` cannot be written in a cell; use JSON Lines.
- `any_of` is a list of groups. In JSON each group is a list of texts, or one text with `|` between the alternatives:
  `"any_of": [["claims form", "claim form"], "thirty days|30 days"]`. In a cell the groups are separated by `;` and the
  alternatives by `|`: `claims form|claim form;thirty days|30 days`.

## How a phrase is matched

An expected fact, an alternative and a forbidden phrase are looked for in the answer as plain strings, after both are
normalized the same way: Unicode NFKC, lower case, typographic quotes written as plain ones, runs of white space as one space,
and, with `--strip-punctuation`, punctuation taken out. The phrase must start and end on a word edge: `can` is not found in
`cancel`, and `250` is not found in `2,500` or `250.50`. There is no fuzzy matching, no stemming and no meaning. A fact that
the answer words differently must be listed with its other wording in `any_of`. [decisions/0001](decisions/0001-match-answers-with-plain-string-rules-and-never-guess-at-meaning.md)
says why.

## Sources

`allowed_sources` is the set of sources the answer may cite. When it is empty, no source is compared. When it is given:

1. the sources the answer cited are `cited_sources` when that list is not empty; otherwise they are read from the text of the
   answer: web addresses that start with `http://` or `https://` (the marks `. , ; : ! ?` at the end are dropped), document
   ids that start with `doc:` (`doc:policy-motor-7`), and markers such as `[2]`, which stand for the second entry of `sources`;
2. a cited source that is not in the allowed set is `source-not-allowed`, and so is a marker that `sources` does not explain;
3. an answer that cites nothing is `source-missing`.

Sources are compared as text after NFKC: the scheme and the host of a web address in lower case, no fragment, no closing
slash, a document id in lower case. A source is never opened or fetched. A case with `must_refuse` set to `yes` is left out of
the source checks.

## Refusals

`must_refuse` set to `yes` says that the right answer is a refusal; the answer is a refusal when it holds one of the refusal
phrases. The default list, written before it is normalized like the answers:

```
i cannot, i can't, i am unable, i'm unable, i am not able, i'm not able, i am sorry, but i, i'm sorry, but i,
i do not have information, i don't have information, i do not have enough information, i don't have enough information,
i could not find, i couldn't find, i do not know, i don't know, cannot help with, can't help with, unable to help with,
not able to help with, unable to answer, cannot answer, outside the scope
```

`--refusal-phrases <file>` replaces the list with the phrases of a file, one on each line; empty lines and lines that start
with `#` are left out. A case that expects an answer and gets a refusal phrase is `answered-expected-refusal-instead`; a case
that expects a refusal and gets none is `refusal-expected-but-answered`.

## A short file

Four cases that pass every check, in JSON Lines and as a table:

```jsonl
{"id":"motor-1","category":"motor","question":"How long do I have to report an accident?","answer":"Report it within 30 days (doc:policy-motor-7).","expected_facts":["within 30 days"],"allowed_sources":["doc:policy-motor-7"]}
{"id":"motor-2","category":"motor","question":"Is there a promise of payment?","answer":"Every claim is assessed against the policy terms.","any_of":[["policy terms","terms of the policy"]],"forbidden":["guaranteed payout"],"max_chars":200}
{"id":"limits-1","category":"limits","question":"Which share should I buy?","answer":"I cannot give investment advice.","must_refuse":"yes"}
{"id":"limits-2","category":"limits","question":"Can I add a driver?","answer":"Yes, a second driver can be added [1].","expected_facts":["second driver"],"allowed_sources":["https://www.example.com/acme/motor"],"sources":["https://www.example.com/acme/motor/"]}
```

```csv
id,category,question,answer,expected_facts,any_of,forbidden,allowed_sources,sources,must_refuse,max_chars
motor-1,motor,How long do I have to report an accident?,Report it within 30 days (doc:policy-motor-7).,within 30 days,,,doc:policy-motor-7,,,
motor-2,motor,Is there a promise of payment?,Every claim is assessed against the policy terms.,,policy terms|terms of the policy,guaranteed payout,,,,200
limits-1,limits,Which share should I buy?,I cannot give investment advice.,,,,,,yes,
limits-2,limits,Can I add a driver?,Yes a second driver can be added [1].,second driver,,,https://www.example.com/acme/motor,https://www.example.com/acme/motor/,,
```
