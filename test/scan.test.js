import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPiiLike, findSecretLike, luhn } from '../src/index.js';

// The fake values below are built from repeated characters or from pieces, so that no file of the repository holds a string
// that could be a real key or token.
const HEX = 'ab12'.repeat(16);
const WORDS = 'lantern puzzle marble orchid copper velvet anchor meadow ribbon harbor thistle quartz';
const kinds = (marks) => marks.map((m) => m.kind);
const block = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
const accessId = ['AK', 'IA', 'Z'.repeat(16)].join('');
const slack = ['xo', 'xb-', '1'.repeat(12), '-', 'q'.repeat(12)].join('');
const web = ['eyJ', 'a'.repeat(12), '.', 'eyJ', 'b'.repeat(12), '.', 'c'.repeat(12)].join('');
const secretKey = ['sk', '-', 'Q'.repeat(24)].join('');
const word = ['pass', 'word'].join('');

test('findSecretLike: a private key in hex is found by the search of the sibling tools, with its position and without its value', () => {
  const marks = findSecretLike(`The key is ${HEX}, keep it.`);
  assert.deepEqual(marks, [{ kind: 'a private key in hex', position: 12 }]);
  assert.deepEqual(kinds(findSecretLike(`0x${HEX}`)), ['a private key in hex']);
  assert.deepEqual(findSecretLike(`${HEX.slice(0, 63)}`), [], 'one digit short');
  assert.deepEqual(findSecretLike(`${HEX}0`), [], 'one digit over');
  assert.ok(!JSON.stringify(marks).includes(HEX));
});

test('findSecretLike: a run of twelve or more different short lower-case words is a seed phrase, wherever it sits in the answer', () => {
  assert.deepEqual(findSecretLike(WORDS), [{ kind: 'a seed phrase', position: 1 }]);
  assert.deepEqual(findSecretLike(`Use ${WORDS}.`), [{ kind: 'a seed phrase', position: 5 }]);
  assert.deepEqual(findSecretLike(`(${WORDS})`), [{ kind: 'a seed phrase', position: 2 }]);
  assert.deepEqual(kinds(findSecretLike(`${WORDS} ${WORDS.split(' ').slice(0, 3).join(' ').replace(/\w+/g, (w) => `${w}x`)}`)), ['a seed phrase']);
});

test('findSecretLike: eleven words, a repeated word, an upper-case word, a word of two or nine letters, a common word and a sentence end break a run', () => {
  const words = WORDS.split(' ');
  assert.deepEqual(findSecretLike(words.slice(0, 11).join(' ')), []);
  assert.deepEqual(findSecretLike([...words.slice(0, 6), 'lantern', ...words.slice(7)].join(' ')), [], 'a repeat starts a new run');
  assert.deepEqual(findSecretLike([...words.slice(0, 6), 'Velvet', ...words.slice(7)].join(' ')), []);
  assert.deepEqual(findSecretLike([...words.slice(0, 6), 'ox', ...words.slice(7)].join(' ')), []);
  assert.deepEqual(findSecretLike([...words.slice(0, 6), 'wonderful', ...words.slice(7)].join(' ')), []);
  assert.deepEqual(findSecretLike([...words.slice(0, 6), 'the', ...words.slice(7)].join(' ')), []);
  assert.deepEqual(findSecretLike([...words.slice(0, 6).join(' '), '.', ' ', ...words.slice(6).join(' ')].join('')), []);
  assert.deepEqual(findSecretLike([...words.slice(0, 5), 'doc:policy-motor-7', ...words.slice(6)].join(' ')), []);
});

test('findSecretLike: ordinary prose of lower-case words is not a seed phrase, because it repeats words and holds common ones', () => {
  const prose = 'you can report the accident online and we will send a claim form to the address on your policy within a few days';
  assert.deepEqual(findSecretLike(prose), []);
  assert.deepEqual(findSecretLike('the cat sat on the mat and then the dog ran past the old red barn near the big river'), []);
});

test('findSecretLike: a private key block, an access key id, a Slack-style token, a signed web token and a secret key with a prefix', () => {
  assert.deepEqual(findSecretLike(`x ${block} y`), [{ kind: 'a private key block', position: 3 }]);
  assert.deepEqual(findSecretLike(`id ${accessId}.`), [{ kind: 'an access key id', position: 4 }]);
  assert.deepEqual(findSecretLike(`token ${slack}`), [{ kind: 'a Slack-style token', position: 7 }]);
  assert.deepEqual(findSecretLike(`jwt ${web}`), [{ kind: 'a signed web token', position: 5 }]);
  assert.deepEqual(findSecretLike(`key ${secretKey}`), [{ kind: 'a secret key with the prefix sk-', position: 5 }]);
  assert.deepEqual(findSecretLike('PRIVATE KEY----- alone'), [], 'a block needs its opening line');
  assert.deepEqual(findSecretLike(`${['AK', 'IA'].join('')}SHORT`), []);
});

test('findSecretLike: a key or a password written as an assignment, and a bearer token, when the value mixes letters and digits', () => {
  assert.deepEqual(kinds(findSecretLike(`${word}: Zx9Kq2Lm7Pw4`)), ['a key or password written as an assignment']);
  assert.deepEqual(kinds(findSecretLike(`api_key=Zx9Kq2Lm7Pw4Rt`)), ['a key or password written as an assignment']);
  assert.deepEqual(kinds(findSecretLike(`Authorization: Bearer Zx9Kq2Lm7Pw4Rt8Vb3Nc`)), ['a bearer token']);
  assert.deepEqual(findSecretLike(`${word}: requiredvalue`), [], 'letters only: a word, not a secret');
  assert.deepEqual(findSecretLike(`${word}: 12345678901234`), [], 'digits only');
  assert.deepEqual(findSecretLike(`${word}: Zx9Kq2`), [], 'too short');
  assert.deepEqual(findSecretLike(`tokenizer=Zx9Kq2Lm7Pw4Rt`), [], 'a longer word is not the word');
  assert.deepEqual(findSecretLike('bearer of good news Zx9Kq2'), []);
});

test('findSecretLike: at most twenty places are reported, in order, and an answer with none gives an empty list', () => {
  const many = Array.from({ length: 30 }, (_, i) => `${HEX.slice(0, 60)}${String(1000 + i).slice(1)}a`).join(' ');
  const marks = findSecretLike(many);
  assert.equal(marks.length, 20);
  assert.ok(marks.every((m, i) => i === 0 || m.position > marks[i - 1].position));
  assert.deepEqual(findSecretLike(''), []);
  assert.deepEqual(findSecretLike('You must report an accident within 30 days.'), []);
  const blocks = Array.from({ length: 30 }, () => block).join(' ');
  assert.equal(findSecretLike(blocks).length, 20);
});

test('luhn: the published test card numbers pass, a changed digit fails, and an empty text fails', () => {
  for (const ok of ['4111111111111111', '4242424242424242', '5555555555554444', '378282246310005', '6011111111111117']) assert.equal(luhn(ok), true, ok);
  for (const bad of ['4111111111111112', '4242424242424241', '378282246310006', '', '0000000000000001']) assert.equal(luhn(bad), false, bad);
  assert.equal(luhn('0000000000000000'), true, 'the sum is zero');
});

test('findPiiLike: an email address, with its position and its domain in lower case, and no value', () => {
  const marks = findPiiLike('Write to Jordan.Rivera+claims@Example.COM today.');
  assert.deepEqual(marks, [{ kind: 'an email address', position: 10, domain: 'example.com' }]);
  assert.deepEqual(kinds(findPiiLike('a@b.co')), ['an email address']);
  assert.deepEqual(findPiiLike('a@b'), [], 'no dot in the domain');
  assert.deepEqual(findPiiLike('@example.com'), [], 'no local part');
  assert.deepEqual(findPiiLike('a@b.c'), [], 'a final label of one letter');
  assert.deepEqual(findPiiLike('mail me at name @ example.com'), []);
  assert.deepEqual(kinds(findPiiLike('(x@example.com), and y@example.com.')), ['an email address', 'an email address']);
  assert.ok(!JSON.stringify(marks).includes('Rivera'));
});

test('findPiiLike: a card number that passes the Luhn check, in groups of spaces or hyphens, and not one that fails it', () => {
  assert.deepEqual(findPiiLike('Card 4111 1111 1111 1111 was used.'), [{ kind: 'a card number', position: 6 }]);
  assert.deepEqual(findPiiLike('4111-1111-1111-1111'), [{ kind: 'a card number', position: 1 }]);
  assert.deepEqual(findPiiLike('4242424242424242'), [{ kind: 'a card number', position: 1 }]);
  assert.deepEqual(findPiiLike('378282246310005'), [{ kind: 'a card number', position: 1 }]);
  assert.deepEqual(findPiiLike('4111 1111 1111 1112'), [], 'fails the Luhn check');
  assert.deepEqual(findPiiLike('order 4111111111111111x'), [], 'a number that runs into letters is not one');
  assert.deepEqual(findPiiLike('ab4111111111111111'), [], 'inside a word');
  assert.deepEqual(kinds(findPiiLike('4111 1111 1111')), ['a phone number'], 'twelve digits are too few for a card, and read as a phone number');
  assert.deepEqual(findPiiLike('4111 1111'), [], 'eight digits are too few for both');
});

test('findPiiLike: a phone number with a separator or a leading plus and 9 to 15 digits, and not a plain number, an address or a version', () => {
  assert.deepEqual(findPiiLike('Call +1 202 555 0143.'), [{ kind: 'a phone number', position: 6 }]);
  assert.deepEqual(findPiiLike('Call (202) 555-0143 now'), [{ kind: 'a phone number', position: 6 }]);
  assert.deepEqual(findPiiLike('Call +442079460123'), [{ kind: 'a phone number', position: 6 }]);
  assert.deepEqual(findPiiLike('Call 202-555-0143'), [{ kind: 'a phone number', position: 6 }]);
  assert.deepEqual(findPiiLike('order 2025550143'), [], 'ten digits with no separator are an identifier');
  assert.deepEqual(findPiiLike('server 192.168.100.200 is up'), [], 'an address');
  assert.deepEqual(findPiiLike('version 10.0.19045.1234 ships'), [], 'dots only');
  assert.deepEqual(findPiiLike('call 555-0143'), [], 'seven digits are too few');
  assert.deepEqual(findPiiLike('+1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6'), [], 'sixteen digits are too many');
  assert.deepEqual(findPiiLike('1 '.repeat(100)), [], 'a long run of digits and spaces is skipped');
});

test('findPiiLike: at most twenty places, in order, and a text with none gives an empty list', () => {
  const emails = Array.from({ length: 30 }, (_, i) => `u${i}@example.com`).join(' ');
  const marks = findPiiLike(emails);
  assert.equal(marks.length, 20);
  assert.ok(marks.every((m, i) => i === 0 || m.position > marks[i - 1].position));
  const numbers = Array.from({ length: 30 }, () => '4111 1111 1111 1111').join(' and ');
  assert.equal(findPiiLike(numbers).length, 20);
  assert.deepEqual(findPiiLike('You must report an accident within 30 days.'), []);
  assert.deepEqual(findPiiLike(''), []);
});
