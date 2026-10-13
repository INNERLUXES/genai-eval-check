# Limits

genai-eval-check is deterministic string checking of answers that are already in a file. It never calls a model, it does not
judge whether an answer is true beyond the facts and phrases the file lists, and it is not a full evaluation of a model. This
document says what that means: what the tool cannot see, where it can be wrong, and the limits of the work it does.

## What a clean result means

A run with no finding at or above the fail-on level means that, in the answers of the file, every listed fact was found as a
phrase, no forbidden phrase was found, the citations were in the allowed sets, the lengths were within the limits, and no
string of the shapes below was found. It does not mean that the answers are true, that the system is good, that a model has
been evaluated, or that the cases are the questions that matter. A pass rate of 100 percent on cases that were written to pass
says nothing about the questions nobody wrote.

## What the tool cannot see

- **Meaning.** The fact `excess is 250` is found in `It is not true that the excess is 250`, and the fact `250` is found in
  `It is not 250`. A phrase is found or it is not; the tool does not read negation, hedging, tone or order. Write facts long
  enough to carry their meaning, and list forbidden phrases for the claims that must never appear.
- **Other wordings.** An answer that says `thirty days` does not hold `30 days`. List both in `any_of`, or the case fails
  (decisions/0001).
- **Whether the listed facts are right.** The tool trusts the file. A wrong expected fact fails a right answer, and a wrong
  forbidden phrase passes a wrong one.
- **Whether a citation supports its sentence.** A cited source is compared with the allowed set as text. It is never opened,
  and a source in the set can be cited for a claim it does not support.
- **How the answer was produced.** The tool sees the text in the file. It does not see the prompt, the retrieved documents,
  the model, the settings or the run; the same question asked twice is two cases.
- **Cases that are not in the file.** A pass rate is the rate over the cases written. It is not a rate over real traffic.
- **A refusal in other words.** A refusal is an answer that holds one of the refusal phrases. A refusal that says `Sorry, that
  is not something we cover` is not seen unless the phrase is added with `--refusal-phrases`. An answer that holds a phrase
  and then answers anyway is seen as a refusal.
- **Languages.** Matching works on any text that NFKC and lower casing handle, but the default refusal phrases are English,
  and word edges are the Unicode letters and digits; a script that writes without spaces (Chinese, Japanese, Thai) has no word
  edges to speak of, and a phrase there is found wherever its characters are.
- **Records that were left out.** They are reported and not in any rate. The rate is the rate of the records that were read.

## Secrets

The search for secrets in an answer is a heuristic with few, loose shapes. It reports the kind and the 1-based character
position and never the value. The shapes:

- the shapes of the sibling tools (`src/secrets.js`) on each word of 20 to 4,000 characters: a private key in hex (64 hex
  digits, with or without `0x`), an extended private key (a letter and `prv`, then 100 or more base58 characters) and a key in
  WIF (51 or 52 base58 characters that start with `5`, `K`, `L`, `c` or `9`);
- a seed phrase: a run of 12 or more different words of 3 to 8 lower-case letters with no mark of a sentence end between them
  and none of a short list of common English words (`the`, `and`, `you`, `can` and their kin), so that ordinary prose is not a
  seed phrase;
- a block that starts with a private key line (`-----BEGIN` ... `PRIVATE KEY-----`);
- an access key id (`AKIA` or `ASIA` and 16 capital letters or digits), a token of a messaging service that starts with `xox`, a
  signed web token (three parts that start with `eyJ`), a secret key that starts with `sk-` and a code-host token that starts
  with `gh` and one letter of `pousr` and an underscore;
- a word such as `password`, `secret`, `token`, `api_key` or `access_key` followed by `:` or `=` and a value of 12 or more
  characters that holds both letters and digits, and `Bearer` followed by such a value of 20 or more.

A secret in another shape is not found. A 64-digit hex hash in an answer (a checksum, say) is read as a private key. A
seed phrase written with commas between the words, or with a capital letter, is not found. The tool searches answers only; it
does not look at questions, facts, notes or any other field.

## Personal data

- an **email address**: a local part of up to 64 characters, an at sign, and a domain of up to 255 characters with a dot and a
  last label of 2 or more letters. `--allow-email-domains` lets chosen domains through; a subdomain is another domain.
- a **card number**: 13 to 19 digits written in one run or in groups separated by single spaces or hyphens, that pass the
  Luhn check. A number that fails the check is not a card number.
- a **phone number**: 9 to 15 digits in a run of digits, spaces, hyphens, points and brackets, that has a leading plus or a
  space, hyphen or bracket in it. A run of digits with no separator, a run with points only (an address or a version number)
  and a run longer than 40 characters are not reported.

Names, street addresses, dates of birth and identifiers of any other shape are not found, and a long number written like a
phone number is reported. A check of personal data is a check that a chosen set of shapes is absent, not a finding that an
answer is free of personal data.

## The work the tool does

Each file is read whole, up to 16 MB. A table has at most 250,000 rows, 40 columns, 3,000,000 cells and 12,000,000 characters
in a cell; JSON Lines has at most 250,000 records, 100 fields in a record and 4 levels of nesting. More records than the limit
are left out with a note. An answer may have up to 12,000,000 characters. A list (facts, alternatives, forbidden phrases,
sources) has at most 1,000 entries and a phrase at most 1,000 characters (2,000 for a source); a list or a phrase past that is
refused and the record is left out, never cut. At most 1,000 findings of one check are listed and the rest are counted and
noted; every case is counted whatever the cap. An answer can cite at most 10,000 distinct sources before the rest are not read,
which is itself reported, and at most 20 places of secrets and 20 of personal data are listed for one answer.

Every search of a phrase costs the length of the answer, and a run may spend 8,000,000,000 characters of searching. A run that
would spend more stops with exit code `2` and a message, so a very large file with a very long list cannot hold the machine.
The reader of tables works through a loop, the checks work through loops and maps, and no function calls itself.
