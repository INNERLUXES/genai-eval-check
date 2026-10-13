import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputError, countPhrase, createWork, findPhrase, normalizeText, spend } from '../src/index.js';

test('normalizeText: NFKC, lower case, plain quotes and one space between words', () => {
  assert.equal(normalizeText('  The   EXCESS\tis\n250  '), 'the excess is 250');
  assert.equal(normalizeText('\uff21\uff22\uff23 \ufb01le'), 'abc file', 'full-width letters and a ligature');
  assert.equal(normalizeText('a\u00a0b\u2003c'), 'a b c', 'no-break and wide spaces');
  assert.equal(normalizeText('don\u2019t \u201cpanic\u201d \u2018x\u2019'), "don't \"panic\" 'x'");
  assert.equal(normalizeText('Stra\u00dfe'), 'stra\u00dfe', 'simple lower casing, not full case folding');
  assert.equal(normalizeText(''), '');
});

test('normalizeText: punctuation is kept by default and taken out with stripPunctuation, in the phrase and the answer alike', () => {
  assert.equal(normalizeText('E-mail us: now!'), 'e-mail us: now!');
  assert.equal(normalizeText('E-mail us: now!', { stripPunctuation: true }), 'e mail us now');
  assert.equal(normalizeText('"Quoted," said it.', { stripPunctuation: true }), 'quoted said it');
  assert.equal(normalizeText('$250 (about)', { stripPunctuation: true }), '$250 about', 'a currency sign is a symbol and stays');
});

test('findPhrase: a phrase is found at word edges, and the index is the place in the text', () => {
  const t = 'the excess is 250 per claim';
  assert.equal(findPhrase(t, 'excess is 250'), 4);
  assert.equal(findPhrase(t, 'per claim'), 18);
  assert.equal(findPhrase(t, 'excess is 25'), -1, 'not the start of a longer number');
  assert.equal(findPhrase(t, 'xcess'), -1, 'not inside a word');
  assert.equal(findPhrase(t, 'claims'), -1);
  assert.equal(findPhrase(t, ''), -1);
  assert.equal(findPhrase(t, 'the', 1), -1, 'search from an index');
});

test('findPhrase: a word is not found inside a longer word, before or after, and an underscore counts as part of a word', () => {
  assert.equal(findPhrase('cancel the plan', 'can'), -1);
  assert.equal(findPhrase('scan it', 'can'), -1);
  assert.equal(findPhrase('can_do it', 'can'), -1);
  assert.equal(findPhrase('you can, then', 'can'), 4);
  assert.equal(findPhrase('(can)', 'can'), 1);
  assert.equal(findPhrase('un\u00e9 can', 'e'), -1, 'a letter with an accent is a letter');
  assert.equal(findPhrase('\u00e9t\u00e9 ok', 't'), -1);
});

test('findPhrase: a number is not found inside a longer number written with a point or a comma, and is found at the end of a sentence', () => {
  assert.equal(findPhrase('pay 2,500 now', '500'), -1);
  assert.equal(findPhrase('pay 250.50 now', '250'), -1);
  assert.equal(findPhrase('pay 250.50 now', '50'), -1);
  assert.equal(findPhrase('pay 1.250 now', '250'), -1);
  assert.equal(findPhrase('pay 250. then', '250'), 4, 'a point that ends a sentence is not part of the number');
  assert.equal(findPhrase('pay 250, then', '250'), 4);
  assert.equal(findPhrase('pay 2,500 now', '2,500'), 4);
  assert.equal(findPhrase('pay 30-day plan', '30'), 4, 'a hyphen is an edge');
  assert.equal(findPhrase('a 250 b', '250'), 2);
});

test('findPhrase: a phrase that starts or ends with a symbol needs no word edge on that side', () => {
  assert.equal(findPhrase('costs $250 a month', '$250'), 6);
  assert.equal(findPhrase('costs a$250', '$250'), 7);
  assert.equal(findPhrase('save 20% today', '20%'), 5);
  assert.equal(findPhrase('save 20%today', '20%'), 5);
  assert.equal(findPhrase('x (see below) y', '(see below)'), 2);
});

test('findPhrase: astral characters count as one letter or symbol, not as two halves', () => {
  const clef = '\ud834\udd1e';
  assert.equal(findPhrase(`a${clef}b`, 'b'), 3, 'a symbol is an edge');
  const letter = '\ud835\udc00';
  assert.equal(findPhrase(`${letter}ab`, 'ab'), -1, 'a mathematical letter is a letter');
  assert.equal(findPhrase(`ab${letter}`, 'ab'), -1);
  assert.equal(findPhrase(`${letter} ab`, 'ab'), 3);
});

test('findPhrase: with a work budget, every search costs the length of the text and a search past the budget stops with an error', () => {
  const work = createWork(100);
  assert.equal(findPhrase('a'.repeat(40), 'b', 0, work), -1);
  assert.equal(work.left, 60);
  assert.equal(findPhrase('a '.repeat(20), 'a', 0, work), 0);
  assert.throws(() => findPhrase('a'.repeat(40), 'b', 0, work), (e) => e instanceof InputError && /work limit of 100 characters/.test(e.message));
  assert.throws(() => spend(createWork(5), 6), InputError);
  assert.doesNotThrow(() => spend(createWork(5), 5));
});

test('countPhrase: counts the places without overlap, at word edges, up to a maximum', () => {
  assert.equal(countPhrase('no no no', 'no'), 3);
  assert.equal(countPhrase('nono no', 'no'), 1);
  assert.equal(countPhrase('aa aa', 'aa'), 2);
  assert.equal(countPhrase('a b', 'zz'), 0);
  assert.equal(countPhrase('a b', ''), 0);
  assert.equal(countPhrase('no no no no', 'no', 2), 2);
  const work = createWork(1000);
  countPhrase('no no', 'no', 10, work);
  assert.equal(work.left, 995);
});
