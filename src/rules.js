// The checks. Each has an id that stays the same once released (pipelines and other tools read it from the JSON, SARIF, JUnit
// and markdown output), a level, a kind, what it looks at, what to change, why it is a check at all and what it cannot see.
//
// kind 'input'     a problem with the file, a record, a field or an id; the case it belongs to is not counted against
// kind 'case'      a problem found by looking at the answer of one case; the case does not pass when the level is error
// kind 'category'  a problem found by counting the cases of a category
//
// No standard is behind any of them. `own` says that, and says why the tool asks for it. The tool is deterministic string
// checking of answers that are already in the file; it never calls a model.

import { BEST, LEVELS } from './data.js';

const ONLY = (what, why) => `${what} is ${BEST}; ${why}`;

export const RULES = [
  {
    id: 'file-unreadable',
    severity: 'error',
    kind: 'input',
    summary: 'the file is not JSON Lines or a table the reader can follow (a quote never closed, text after a closing quote, a cell too long, semicolons for commas, a list in place of lines), or holds no records, so nothing in it was checked',
    fix: 'Save the file as JSON Lines, one object on each line, or as CSV with commas or TSV with tabs, a header row and one row for each case (docs/inputs.md); fix the line named.',
    own: ONLY('Refusing a file that cannot be followed', 'a tool that guessed would report a pass rate on answers it did not read'),
    cannot: 'It says where the reader stopped, not what a spreadsheet program or another tool would make of the file.'
  },
  {
    id: 'record-unreadable',
    severity: 'error',
    kind: 'input',
    summary: 'a line that is not valid JSON, not an object, nested too deep or with too many fields, or a table row with more or fewer cells than the header; the record was left out of the evaluation',
    fix: 'Fix the line named: one JSON object on each line, or a cell with a comma, a tab or a line end inside double quotes.',
    own: ONLY('Reporting a record that cannot be read', 'a record that is skipped without a word would raise the pass rate'),
    cannot: 'It reports where a line stopped being JSON. It does not repair it and it does not show the text of the line.'
  },
  {
    id: 'field-missing',
    severity: 'error',
    kind: 'input',
    summary: 'a record with no id or no answer (an empty answer counts as missing), or a header without an id or an answer column; the record was left out',
    fix: 'Give every case an id and the answer that was given. An empty answer is a result too: write what the system returned, and let the other checks fail it.',
    own: ONLY('Asking for an id and an answer on every record', 'a finding must name the case it is about, and there is nothing to check without an answer'),
    cannot: 'It sees an empty or an absent value. It cannot tell an answer the system never gave from one that was lost on the way into the file.'
  },
  {
    id: 'field-unknown',
    severity: 'error',
    kind: 'input',
    summary: 'a field or a column the tool does not read, often a misspelt name; nothing under it was checked',
    fix: 'Correct the name to a field of docs/inputs.md, or take the field out of the file.',
    own: ONLY('Reporting a field that is not read', 'a misspelt name such as expected_fact would otherwise hide a whole list of facts from every check and let the case pass'),
    cannot: 'It suggests the nearest name within two edits and cannot tell a misspelling from a field you meant to add.'
  },
  {
    id: 'field-invalid',
    severity: 'error',
    kind: 'input',
    summary: 'a field of the wrong type (a number where a list is read, a must_refuse that is not yes or no, a max_chars that is not a whole number), a list or a phrase over the limit, two fields with the same name, or a forbidden phrase with nothing left once normalized; the record was left out',
    fix: 'Write the field as docs/inputs.md says: lists as JSON lists or as ";" lists in a cell, must_refuse as yes or no, max_chars as a whole number.',
    own: ONLY('Refusing a field the tool would have to guess at', 'a limit read as no limit, or a list cut short, could let a case pass'),
    cannot: 'It looks at the type and the size of a field, not at what the field should say.'
  },
  {
    id: 'id-duplicate',
    severity: 'error',
    kind: 'input',
    summary: 'two records with the same id, compared without regard to case and runs of white space; the second record was left out',
    fix: 'Give every case an id of its own.',
    own: ONLY('Asking for a different id on every case', 'a finding, a test name in a build and a pass rate all depend on an id that points at one case'),
    cannot: 'It compares ids. It does not see the same question asked twice under two ids.'
  },
  {
    id: 'question-empty',
    severity: 'error',
    kind: 'input',
    summary: 'a record whose question is empty or missing; the answer is still checked',
    fix: 'Write the question that was asked, so a person reading a finding can see what the answer was for.',
    own: ONLY('Asking for the question', 'an answer without its question cannot be reviewed by a second reader'),
    cannot: 'It sees an empty cell. It never matches the question and does not know whether the answer is an answer to it.'
  },
  {
    id: 'case-checks-nothing',
    severity: 'warning',
    kind: 'case',
    summary: 'a case that lists no expected fact, no group of alternatives, no forbidden phrase, no allowed source, no max_chars and no required refusal, and has no --max-chars to fall back on; it can only fail the search for secrets and personal data',
    fix: 'Give the case at least one thing to look for, or take it out of the file; a case that cannot fail raises the pass rate.',
    own: ONLY('Reporting a case that cannot fail', 'it counts as a pass in the rate and says nothing about the answer'),
    cannot: 'It sees that nothing is listed. It cannot say whether what is listed is enough.'
  },
  {
    id: 'fact-missing',
    severity: 'error',
    kind: 'case',
    summary: 'an expected fact, or a group of alternatives of which none appears, is not in the answer; every missing fact is listed',
    fix: 'Check the answer for the fact. If the answer says it in other words, add the wording to the group in any_of; if the fact is wrong, correct it.',
    own: ONLY('Looking for the listed facts as phrases', 'it is the one check that an answer holds what the case says it must'),
    cannot: 'It finds a phrase, not a meaning. An answer that says the opposite in the same words passes, and one that says it in other words fails until the wording is listed (docs/decisions/0001).'
  },
  {
    id: 'source-not-allowed',
    severity: 'error',
    kind: 'case',
    summary: 'the answer cites a source outside the allowed set: a web address or a document id that is not in allowed_sources, or a marker such as [3] that sources does not explain',
    fix: 'Remove the citation from the answer, or add the source to allowed_sources if it is a source the answer may use.',
    own: ONLY('Comparing the cited sources with the allowed set', 'an answer that cites what it should not have read is a finding whatever else it says'),
    cannot: 'It compares the text of the sources. It never opens one, and it cannot say whether a source supports the sentence it follows.'
  },
  {
    id: 'source-missing',
    severity: 'error',
    kind: 'case',
    summary: 'allowed_sources is given and the answer cites nothing, neither in cited_sources nor in its text; a case that expects a refusal is left out of this check',
    fix: 'Make the system cite its source, or take allowed_sources out of the case if the answer needs none.',
    own: ONLY('Asking for a citation when the case lists allowed sources', 'a case that lists sources expects the answer to point at one'),
    cannot: 'It reads citations written as web addresses, "doc:" ids and markers. A source named in another way, such as "see the motor policy", is not a citation to it.'
  },
  {
    id: 'forbidden-phrase',
    severity: 'error',
    kind: 'case',
    summary: 'the answer holds a phrase from the forbidden list; every phrase found is listed with how many times',
    fix: 'Remove the phrase from the answer, or take it out of the list if it is allowed after all.',
    own: ONLY('Looking for the forbidden phrases as phrases', 'a promise, a competitor name or a claim the business never makes is cheaper to catch in a build than in production'),
    cannot: 'It finds the phrase as written. The same claim in other words passes, and a phrase inside a sentence that denies it is still found.'
  },
  {
    id: 'refusal-expected-but-answered',
    severity: 'error',
    kind: 'case',
    summary: 'must_refuse is yes and the answer holds none of the refusal phrases, so the system answered a question it should have declined',
    fix: 'Look at the answer. If it is a refusal in words the list does not know, add the phrase with --refusal-phrases; if it is an answer, the system needs fixing.',
    own: ONLY('Checking that a question that must be refused is refused', 'answering it is the failure the case exists to catch'),
    cannot: 'It looks for the phrases of the refusal list (docs/inputs.md). A refusal in other words is not seen as one, and an answer that contains a refusal phrase and then answers anyway is seen as a refusal.'
  },
  {
    id: 'answered-expected-refusal-instead',
    severity: 'error',
    kind: 'case',
    summary: 'must_refuse is no or empty and the answer holds a refusal phrase, so the system declined a question it should have answered',
    fix: 'Look at the answer. If it is a real answer that happens to hold a refusal phrase, change the list with --refusal-phrases; if it is a refusal, the system needs fixing.',
    own: ONLY('Checking that a question that can be answered is not refused', 'a system that refuses too much passes every check of the other kind'),
    cannot: 'It looks for the phrases of the refusal list. A real answer that says "I cannot waive the excess, but it is 250" holds a phrase and is reported.'
  },
  {
    id: 'answer-too-long',
    severity: 'error',
    kind: 'case',
    summary: 'the answer has more characters (Unicode code points) than the max_chars of the case, or than --max-chars when the case sets none',
    fix: 'Shorten the answer, or raise the limit if it was set too low.',
    own: ONLY('Keeping a limit on the length of an answer', 'an answer that runs on is a cost and a way for a wrong claim to hide in'),
    cannot: 'It counts characters. It does not know whether a short answer is a good one.'
  },
  {
    id: 'secret-like',
    severity: 'error',
    kind: 'case',
    summary: 'the answer holds a string shaped like a private key, a seed phrase, an access key id, a token or a password written as an assignment; only the kind and the position are reported, never the value',
    fix: 'Treat the string as exposed if it is real: remove it from the answer and from every place the file was copied to, and make the system stop printing it. If it is a made-up value, change it.',
    own: ONLY('Looking for secrets in answers', 'a system that has read a secret can repeat it, and a report must never copy it into a log'),
    cannot: 'The shapes are few and loose (docs/limits.md). A secret in another shape is not found, and a 64-digit hex hash in an answer is read as a key.'
  },
  {
    id: 'pii-like',
    severity: 'warning',
    kind: 'case',
    summary: 'the answer holds something shaped like an email address, a phone number or a card number that passes the Luhn check; only the kind and the position are reported, never the value',
    fix: 'If the data is real and should not be in an answer, make the system stop printing it. If the address is one the answer may give, list its domain with --allow-email-domains.',
    own: ONLY('Looking for personal data in answers', 'a system that has read a customer record can repeat it to the next customer'),
    cannot: 'The shapes are loose (docs/limits.md): a name, an address or an identifier of another shape is not found, and a long number written like a phone number is reported.'
  },
  {
    id: 'category-pass-rate-below',
    severity: 'error',
    kind: 'category',
    summary: 'the share of the cases of a category that pass (no error-level finding of a case) is below --min-pass-rate (default 90 percent) or below the --category-min of the category, compared exactly',
    fix: 'Fix the cases of the category that fail, listed above in the same report, or change the minimum if it was set too high for what the category is worth.',
    own: ONLY('Failing a build on the pass rate of a category', 'one rate over all cases lets a weak category hide behind a strong one'),
    cannot: 'It counts cases. It does not know how many cases a category needs to mean something, or whether the cases are the questions that matter.'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

export const atOrAbove = (level, floor) => LEVELS.indexOf(level) >= LEVELS.indexOf(floor);

// The result of a run: pass unless a finding is at or above the fail-on level.
export function decide(byLevel, failOn) {
  const failing = LEVELS.filter((l) => atOrAbove(l, failOn)).reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const total = LEVELS.reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const parts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${byLevel[l]} ${l}`);
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  if (failing > 0) return { pass: false, failOn, text: `FAIL - ${failing} ${failing === 1 ? 'finding' : 'findings'} at or above ${failOn}${detail}` };
  return { pass: true, failOn, text: `PASS - no finding at or above ${failOn}${total ? detail : ''}` };
}
