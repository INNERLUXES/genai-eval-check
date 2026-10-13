# 3. Read the file on disk, and never call a model or the network

## Status

Accepted

## Context

A tool that evaluates a generative system could run the system itself, send each question to a model, open every source an
answer cites to see that it exists, or ask a second model to judge each answer. Each of those needs the network and usually a
key, makes the result depend on the state of other people's servers at the moment of the run, sends the questions and answers
of a business to a third party, costs money on every run and lets a file in a pull request make the pipeline reach any address
it names. A source that exists is also not a source that supports the sentence.

What a team needs first, before it trusts a change, is a list of what is wrong in answers it already has, and where. The
answers are text in a file, and can be checked the same way on every run.

## Decision

1. The tool reads the file it is given, and the file of refusal phrases when one is named, and nothing else. It never calls a
   model, contacts nothing over the network, fetches nothing, opens no source, needs no key, runs no program and sends no data
   anywhere.
2. A web address or a document id in an answer or in `allowed_sources` is text. It is compared as text and never opened.
3. The tool reads no clock and no locale. Nothing in an evaluation set needs the date, so no option gives it one, the same input
   gives the same report on every day, and the JUnit report records every time as 0.
4. The checks work from the file alone. What the file does not say is not seen, and docs/limits.md says what that is.
5. The fields and the checks are in the code, kept short and named in docs/inputs.md and docs/method.md. They change in a
   release, never while the tool runs.
6. Every check is a best practice of this tool. No standard is behind any of them, and the reports and the documents say so in
   plain words.
7. The tool lists what to look at and what to change; it changes nothing and sends nothing.

## Consequences

- The result depends only on the file and the options, and a run needs no network access and no secret.
- Producing the answers is a separate step with its own keys. The pipeline runs the system, saves its answers, and then runs
  this tool on the saved file.
- A citation that goes nowhere passes if it is in the allowed set, and a person has to open the source.
