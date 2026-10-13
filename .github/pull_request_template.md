## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run test:coverage`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a check is described in docs/method.md, says what it can and cannot see, and has a test with the cases written inline and a near miss on each side
- [ ] A change to what the tool cannot see is in docs/limits.md
- [ ] A check is still a best practice of the tool and says so in its `own` and `cannot` text; nothing in the change claims that a standard sets it
- [ ] Nothing in the change, the README or the output reads as a judgement that an answer is true, that a system is safe or good, or that a model has been evaluated; a clean report is still worded as "no finding at or above the level"
- [ ] Matching is still plain string work: no stemming, no synonyms, no edit distance, no similarity score and no call to a model (docs/decisions/0001)
- [ ] The tool still reads the text of the file and nothing else: it calls no model, contacts nothing over the network, opens no source, runs nothing, reads no clock and writes nothing to disk
- [ ] A secret or a piece of personal data is still reported by its kind and its position only, and no report or error message shows its value, in any format
- [ ] A record that cannot be read or used is still an error finding that is counted as left out, a list is never read in part, and a check never takes a part it did not read for one that is fine
- [ ] Pass rates and minimums are still exact, with BigInt and no floating point number, and a number is rounded only when it is shown
- [ ] The reader, the searches and the checks still do not recurse, and no pair of cases is walked
- [ ] No pattern is built from a file or from an argument
- [ ] Text from the input goes through `safeText` before it reaches the output or an error message, the markdown format escapes what markdown gives a meaning to, and the JUnit format escapes XML
- [ ] The work stays bounded: the limits of docs/limits.md hold, and a hostile test has a time check that widens under coverage through `NODE_V8_COVERAGE`
- [ ] A test that depends on the operating system (a link, a device, a control character in a file name) is guarded with `process.platform`, asserts no line of its own, and builds its paths with `resolve()` from forward-slash names; no test asserts the hash or version of an action
- [ ] The examples stay made up and minimal: no real company, address, person or customer, no real key, no token shaped like one of a code host, no date and no number that reads like a year
- [ ] The commit messages of this pull request follow Conventional Commits
