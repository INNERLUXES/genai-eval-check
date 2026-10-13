# Context

This document says what checking answers against an evaluation set is good for, and where it misleads. It is background for
reading the reports, not a claim that the tool makes them better.

## What an evaluation set is

A system that answers questions in words (a help desk bot, a search over documents that writes a reply, a drafting tool) does
not fail the way a function fails. It returns something every time. A team that changes the prompt, the documents, the model
or the settings needs a way to see whether the answers got worse, and the usual way is a list of questions with what a good
answer must hold: the facts, the sources it may use, the things it must not say, and the questions it must decline. That list
is an evaluation set. Run the system on the set, save the answers, and check the answers.

genai-eval-check is the last step only. It does not run the system and does not call a model. It reads the questions and the
answers that are already saved, together with what each answer must hold, and lists what does not hold. That makes the check
cheap, repeatable and the same on every machine, which is what a build needs. It also makes it narrow.

## Where plain string checking helps

- **Facts that have one right wording** such as a limit, a period, a name or an amount. An answer that gets the number wrong
  or drops it is found.
- **Claims that must never appear**, such as a promise of payment, an offer the business does not make or the name of a
  competitor.
- **Sources.** A system that must answer from a given set of documents can be checked for citing only those documents, and for
  citing something at all.
- **Questions that must be declined**, and questions that must not be. A system that starts to refuse too much, or too little,
  moves the pass rate of a category before anyone notices in production.
- **Things that must not leak**, such as a key, a seed phrase, an email address or a card number.
- **A build that fails.** Because the result is a pass rate per category and an exit code, a pipeline can stop a change that
  makes a category worse, and a JUnit report shows each case as a test.

## Where it misleads

- **A pass is not a finding of truth.** An answer that holds the listed phrase and then contradicts it passes. The tool finds
  strings.
- **Wording drifts.** A new model that says `thirty days` for `30 days` fails every case that lists only the digits. The
  remedy is to list the wordings that are right in `any_of`, not to make the matching looser; looser matching passes answers
  nobody has read (docs/decisions/0001).
- **The set ages.** Policies change. A case that lists last quarter's limit fails the right answer, and the failure is the
  set's fault. A set needs an owner.
- **A rate hides the cases.** Ninety percent of a hundred cases is ten answers that failed. Read them. The report lists every
  failing case with its id.
- **Easy cases raise the rate.** A set made of questions the system always gets right has a high rate and says nothing. The
  `case-checks-nothing` check reports the cases that cannot fail at all; it cannot report the cases that are too easy.
- **Small categories.** Two cases in a category are 100, 50 or 0 percent. Set a minimum that fits the number of cases.
- **It is not an evaluation of a model.** It says nothing about reasoning, safety in general, bias, fluency or usefulness. A
  full evaluation of a model uses more than this: many more cases, human review, and often another model as a judge, which
  this tool does not do and does not replace.

## Using it well

Keep the set small, owned and reviewed; write each fact so that it carries its meaning; list the right alternative wordings;
add a case when a failure reaches a customer; keep forbidden phrases for the claims that matter; keep the answers in the file
exactly as the system returned them; and treat a failing case as a question for a person, who decides whether the system or
the set is wrong.
