# 1. Match answers with plain string rules, and never guess at meaning

## Status

Accepted

## Context

An answer to a question is free text, and the same fact can be written in many ways: `30 days`, `thirty days`, `a month`,
`within the month`. A tool that checks answers has to decide when a fact is in an answer. It could:

- compare strings, with a few fixed clean-ups;
- compare after stemming, removing stop words or splitting into tokens and scoring the overlap;
- compare with an edit distance or a similarity score and a threshold;
- compare with an embedding of the meaning of the two texts, or ask another model whether the answer says the fact.

The last two are fuzzy or semantic matching. They pass answers that are close, and they are what makes a check feel clever. They
also bring a threshold that someone has to choose, a result that changes when a library, a model or a language changes, a need
for a network or a model on the machine, and a pass that nobody can explain: a reader who sees `pass` cannot say which words
made it pass. A build that fails on a rate needs a result that is the same today and next month and that a reviewer can
verify with a text editor.

## Decision

1. A fact, an alternative, a forbidden phrase and a refusal phrase are looked for in the answer as plain strings. Both sides are
   normalized the same way and in a documented order: Unicode NFKC, lower case, plain quotes, white space collapsed, and
   punctuation taken out only when `--strip-punctuation` is given.
2. A phrase must start and end on a word edge, so `can` is not found in `cancel` and `250` is not found in `2,500`. That is the
   one piece of care the matching has, and it is there because substring matching of numbers and short words passes wrong
   answers.
3. There is no stemming, no synonym list, no edit distance, no similarity score, no embedding and no call to a model.
4. Other wordings are the job of the person who writes the case: they are listed in `any_of`, where a reviewer can see them. A
   fact the system words in a new way fails until the wording is added, and the failure is the signal to look at the answer.
5. A negation, a hedge and a contradiction are not seen. A forbidden phrase is the tool for a claim that must not appear.

## Consequences

- The result depends only on the file and the options. It is the same on every machine and every day and needs no network.
- Every pass and every failure can be explained by pointing at a phrase.
- The check is strict. A correct answer in unlisted words fails, and the set needs care as the system's wording changes. The
  documents say so (docs/limits.md, docs/context.md).
- A semantic check, if a team wants one, is a different tool that calls a model. This tool does not become that tool.
