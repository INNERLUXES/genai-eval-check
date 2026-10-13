# genai-eval-check: examples/good/cases.jsonl

- File: examples/good/cases.jsonl \(JSONL, 13 lines, 4,336 bytes\)
- Records: 13
- Cases: 13 evaluated, 13 pass, 0 fail; pass rate 100.0 percent
- Settings: minimum pass rate 90 percent; punctuation kept; refusal phrases: default list
- Findings: 0
- Result: **PASS - no finding at or above error**

## Categories

| Category | Cases | Pass | Fail | Pass rate | Minimum |
| --- | --- | --- | --- | --- | --- |
| motor | 3 | 3 | 0 | 100.0% | 90% |
| home | 3 | 3 | 0 | 100.0% | 90% |
| travel | 2 | 2 | 0 | 100.0% | 90% |
| claims | 2 | 2 | 0 | 100.0% | 90% |
| boundaries | 3 | 3 | 0 | 100.0% | 90% |

## Findings

None.

This report is deterministic string checking of answers that are already in the file. It never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model.
