// What every report says about itself. The tool is deterministic string checking of answers that are already in the file. It
// never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not
// a full evaluation of a model. No standard sets any check of this tool: each one is a best practice of the tool, and the
// reports and the documents say so.

export const LEVELS = ['info', 'warning', 'error'];

// The kinds of check: about the input itself (its records, fields and ids), about one case, or about a category of cases.
export const KINDS = ['input', 'case', 'category'];

export const NOT_A = 'deterministic string checking of answers that are already in the file; it never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model';

export const NOTICE = 'This report is deterministic string checking of answers that are already in the file. It never calls a model, it does not judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model.';

// Why a check is a best practice and not a rule.
export const BEST = 'a best practice of this tool; no standard sets it';

// The default of the option that sets a threshold, as the text of the option.
export const DEFAULTS = { minPassRate: '90' };

// The label of the cases that have no category.
export const NO_CATEGORY = '(no category)';

// The phrases that mean an answer is a refusal, before they are normalized like the answers. --refusal-phrases replaces them.
export const REFUSAL_PHRASES = [
  'i cannot',
  "i can't",
  'i am unable',
  "i'm unable",
  'i am not able',
  "i'm not able",
  'i am sorry, but i',
  "i'm sorry, but i",
  'i do not have information',
  "i don't have information",
  'i do not have enough information',
  "i don't have enough information",
  'i could not find',
  "i couldn't find",
  'i do not know',
  "i don't know",
  'cannot help with',
  "can't help with",
  'unable to help with',
  'not able to help with',
  'unable to answer',
  'cannot answer',
  'outside the scope'
];

// The limits of the work. A list or a phrase past a limit is a finding and the record is left out; the tool never cuts a list
// and goes on, because a cut list could let a case pass.
export const LIMITS = {
  maxCases: 250000,
  maxFieldChars: 12000000,
  maxListEntries: 1000,
  maxPhraseChars: 1000,
  maxKeys: 100,
  maxJsonDepth: 4,
  maxWork: 8000000000,
  maxCitations: 10000,
  maxMarks: 20
};
