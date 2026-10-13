# fact-missing

- Level: error
- Kind: case

**What it looks at.** an expected fact, or a group of alternatives of which none appears, is not in the answer; every missing fact is listed

**Why it exists.** Looking for the listed facts as phrases is a best practice of this tool; no standard sets it; it is the one check that an answer holds what the case says it must

**What to change.** Check the answer for the fact. If the answer says it in other words, add the wording to the group in any\_of; if the fact is wrong, correct it.

**What it cannot see.** It finds a phrase, not a meaning. An answer that says the opposite in the same words passes, and one that says it in other words fails until the wording is listed \(docs/decisions/0001\).

This check is a best practice of this tool; no standard sets it.
