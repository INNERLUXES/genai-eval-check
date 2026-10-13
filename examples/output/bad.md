# genai-eval-check: examples/bad/cases.jsonl

- File: examples/bad/cases.jsonl \(JSONL, 22 lines, 4,336 bytes\)
- Records: 22 \(15 evaluated, 7 records left out\)
- Cases: 15 evaluated, 7 pass, 8 fail; pass rate 46.7 percent
- Settings: minimum pass rate 90 percent; punctuation kept; refusal phrases: default list
- Findings: 27 \(24 error, 3 warning\)
- Result: **FAIL - 24 findings at or above error \(24 error, 3 warning\)**

## Categories

| Category | Cases | Pass | Fail | Pass rate | Minimum |
| --- | --- | --- | --- | --- | --- |
| motor | 3 | 1 | 2 | 33.3% | 90% \(below\) |
| home | 3 | 1 | 2 | 33.3% | 90% \(below\) |
| travel | 3 | 0 | 3 | 0.0% | 90% \(below\) |
| claims | 3 | 2 | 1 | 66.7% | 90% \(below\) |
| \(no category\) | 1 | 1 | 0 | 100.0% | 90% |
| boundaries | 2 | 2 | 0 | 100.0% | 90% |

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| error | field-missing | examples/bad/cases.jsonl:11 | The record has no "id", which every case needs; the record was left out. Fix: Give every case an id and the answer that was given. An empty answer is a result too: write what the system returned, and let the other checks fail it. |
| error | question-empty | examples/bad/cases.jsonl:13 | The case "claims-003" has no question. Fix: Write the question that was asked, so a person reading a finding can see what the answer was for. |
| error | id-duplicate | examples/bad/cases.jsonl:14 | The id "MOTOR-001" is the id of the case on line 1 too; the second record was left out. Fix: Give every case an id of its own. |
| error | field-unknown | examples/bad/cases.jsonl:15 | The field "expected\_fact" is not a field the tool reads; did you mean "expected\_facts"? Nothing under it is checked. Fix: Correct the name to a field of docs/inputs.md, or take the field out of the file. |
| error | field-invalid | examples/bad/cases.jsonl:16 | The field "must\_refuse" is "maybe", and must\_refuse is yes, no or empty; the record was left out. Fix: Write the field as docs/inputs.md says: lists as JSON lists or as ";" lists in a cell, must\_refuse as yes or no, max\_chars as a whole number. |
| error | field-invalid | examples/bad/cases.jsonl:16 | The field "max\_chars" is "ten", and max\_chars is a whole number from 1 to 100,000,000; the record was left out. Fix: Write the field as docs/inputs.md says: lists as JSON lists or as ";" lists in a cell, must\_refuse as yes or no, max\_chars as a whole number. |
| error | field-missing | examples/bad/cases.jsonl:17 | The case "home-005" has no "answer" \(an empty answer is a missing one\); the record was left out. Fix: Give every case an id and the answer that was given. An empty answer is a result too: write what the system returned, and let the other checks fail it. |
| error | record-unreadable | examples/bad/cases.jsonl:18 | The line is not valid JSON \(near character 114\); the record was left out. Fix: Fix the line named: one JSON object on each line, or a cell with a comma, a tab or a line end inside double quotes. |
| error | record-unreadable | examples/bad/cases.jsonl:19 | The line is a list, and every line of a JSON Lines file is an object; the record was left out. Fix: Fix the line named: one JSON object on each line, or a cell with a comma, a tab or a line end inside double quotes. |
| error | record-unreadable | examples/bad/cases.jsonl:20 | The record is nested deeper than 4 levels, which no case needs; it was not parsed and was left out. Fix: Fix the line named: one JSON object on each line, or a cell with a comma, a tab or a line end inside double quotes. |
| error | fact-missing | examples/bad/cases.jsonl:2 | The case "motor-002" misses 2 expected facts: "standard excess is 250" and "windscreen". Fix: Check the answer for the fact. If the answer says it in other words, add the wording to the group in any\_of; if the fact is wrong, correct it. |
| error | fact-missing | examples/bad/cases.jsonl:3 | The case "motor-003" misses 1 expected fact: one of "subject to the policy terms" or "subject to the terms of your policy". Fix: Check the answer for the fact. If the answer says it in other words, add the wording to the group in any\_of; if the fact is wrong, correct it. |
| error | forbidden-phrase | examples/bad/cases.jsonl:3 | The case "motor-003" holds the forbidden phrase "guaranteed payout". Fix: Remove the phrase from the answer, or take it out of the list if it is allowed after all. |
| error | source-not-allowed | examples/bad/cases.jsonl:4 | The case "home-001" cites sources outside the allowed set: "https://www.example.com/blog/flood-tips", "doc:policy-travel-2" and the marker \[4\], which sources does not explain. Fix: Remove the citation from the answer, or add the source to allowed\_sources if it is a source the answer may use. |
| error | source-missing | examples/bad/cases.jsonl:5 | The case "home-002" lists 1 allowed source, but the answer cites none. Fix: Make the system cite its source, or take allowed\_sources out of the case if the answer needs none. |
| error | refusal-expected-but-answered | examples/bad/cases.jsonl:6 | The case "travel-001" expects a refusal, but the answer holds none of the 23 refusal phrases. Fix: Look at the answer. If it is a refusal in words the list does not know, add the phrase with --refusal-phrases; if it is an answer, the system needs fixing. |
| error | answered-expected-refusal-instead | examples/bad/cases.jsonl:7 | The case "travel-002" expects an answer, but the answer holds the refusal phrase "i cannot". Fix: Look at the answer. If it is a real answer that happens to hold a refusal phrase, change the list with --refusal-phrases; if it is a refusal, the system needs fixing. |
| error | fact-missing | examples/bad/cases.jsonl:7 | The case "travel-002" misses 1 expected fact: "medical costs abroad are covered". Fix: Check the answer for the fact. If the answer says it in other words, add the wording to the group in any\_of; if the fact is wrong, correct it. |
| error | answer-too-long | examples/bad/cases.jsonl:8 | The case "travel-003" has an answer of 137 characters; the limit is 60. Fix: Shorten the answer, or raise the limit if it was set too low. |
| error | secret-like | examples/bad/cases.jsonl:9 | The answer of the case "claims-001" holds 2 things shaped like a secret: a seed phrase at character 46 and a private key in hex at character 159. The values are not shown. Fix: Treat the string as exposed if it is real: remove it from the answer and from every place the file was copied to, and make the system stop printing it. If it is a made-up value, change it. |
| error | category-pass-rate-below | examples/bad/cases.jsonl:1 | In the category "motor" 1 of 3 cases pass \(33.3 percent\), below the minimum of 90 percent. Fix: Fix the cases of the category that fail, listed above in the same report, or change the minimum if it was set too high for what the category is worth. |
| error | category-pass-rate-below | examples/bad/cases.jsonl:4 | In the category "home" 1 of 3 cases pass \(33.3 percent\), below the minimum of 90 percent. Fix: Fix the cases of the category that fail, listed above in the same report, or change the minimum if it was set too high for what the category is worth. |
| error | category-pass-rate-below | examples/bad/cases.jsonl:6 | In the category "travel" 0 of 3 cases pass \(0.0 percent\), below the minimum of 90 percent. Fix: Fix the cases of the category that fail, listed above in the same report, or change the minimum if it was set too high for what the category is worth. |
| error | category-pass-rate-below | examples/bad/cases.jsonl:9 | In the category "claims" 2 of 3 cases pass \(66.7 percent\), below the minimum of 90 percent. Fix: Fix the cases of the category that fail, listed above in the same report, or change the minimum if it was set too high for what the category is worth. |
| warning | pii-like | examples/bad/cases.jsonl:10 | The answer of the case "claims-002" holds 3 things shaped like personal data: an email address at character 41, a phone number at character 75 and a card number at character 109. The values are not shown. Fix: If the data is real and should not be in an answer, make the system stop printing it. If the address is one the answer may give, list its domain with --allow-email-domains. |
| warning | case-checks-nothing | examples/bad/cases.jsonl:12 | The case "general-001" lists no expected fact, no alternatives, no forbidden phrase, no allowed source, no limit and no required refusal, so it can fail only the search for secrets and personal data. Fix: Give the case at least one thing to look for, or take it out of the file; a case that cannot fail raises the pass rate. |
| warning | case-checks-nothing | examples/bad/cases.jsonl:15 | The case "home-003" lists no expected fact, no alternatives, no forbidden phrase, no allowed source, no limit and no required refusal, so it can fail only the search for secrets and personal data. Fix: Give the case at least one thing to look for, or take it out of the file; a case that cannot fail raises the pass rate. |

This report is deterministic string checking of answers that are already in the file. It never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model.
