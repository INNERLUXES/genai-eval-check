# genai-eval-check checks

| Check | Level | Kind | What it looks at |
| --- | --- | --- | --- |
| file-unreadable | error | input | the file is not JSON Lines or a table the reader can follow \(a quote never closed, text after a closing quote, a cell too long, semicolons for commas, a list in place of lines\), or holds no records, so nothing in it was checked |
| record-unreadable | error | input | a line that is not valid JSON, not an object, nested too deep or with too many fields, or a table row with more or fewer cells than the header; the record was left out of the evaluation |
| field-missing | error | input | a record with no id or no answer \(an empty answer counts as missing\), or a header without an id or an answer column; the record was left out |
| field-unknown | error | input | a field or a column the tool does not read, often a misspelt name; nothing under it was checked |
| field-invalid | error | input | a field of the wrong type \(a number where a list is read, a must\_refuse that is not yes or no, a max\_chars that is not a whole number\), a list or a phrase over the limit, two fields with the same name, or a forbidden phrase with nothing left once normalized; the record was left out |
| id-duplicate | error | input | two records with the same id, compared without regard to case and runs of white space; the second record was left out |
| question-empty | error | input | a record whose question is empty or missing; the answer is still checked |
| case-checks-nothing | warning | case | a case that lists no expected fact, no group of alternatives, no forbidden phrase, no allowed source, no max\_chars and no required refusal, and has no --max-chars to fall back on; it can only fail the search for secrets and personal data |
| fact-missing | error | case | an expected fact, or a group of alternatives of which none appears, is not in the answer; every missing fact is listed |
| source-not-allowed | error | case | the answer cites a source outside the allowed set: a web address or a document id that is not in allowed\_sources, or a marker such as \[3\] that sources does not explain |
| source-missing | error | case | allowed\_sources is given and the answer cites nothing, neither in cited\_sources nor in its text; a case that expects a refusal is left out of this check |
| forbidden-phrase | error | case | the answer holds a phrase from the forbidden list; every phrase found is listed with how many times |
| refusal-expected-but-answered | error | case | must\_refuse is yes and the answer holds none of the refusal phrases, so the system answered a question it should have declined |
| answered-expected-refusal-instead | error | case | must\_refuse is no or empty and the answer holds a refusal phrase, so the system declined a question it should have answered |
| answer-too-long | error | case | the answer has more characters \(Unicode code points\) than the max\_chars of the case, or than --max-chars when the case sets none |
| secret-like | error | case | the answer holds a string shaped like a private key, a seed phrase, an access key id, a token or a password written as an assignment; only the kind and the position are reported, never the value |
| pii-like | warning | case | the answer holds something shaped like an email address, a phone number or a card number that passes the Luhn check; only the kind and the position are reported, never the value |
| category-pass-rate-below | error | category | the share of the cases of a category that pass \(no error-level finding of a case\) is below --min-pass-rate \(default 90 percent\) or below the --category-min of the category, compared exactly |
