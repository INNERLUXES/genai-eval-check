import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS, allowedSet, extractCitations, isAllowed, normalizeSource } from '../src/index.js';

test('normalizeSource: a web address has its scheme and host in lower case and no fragment or closing slash; a document id is lower case', () => {
  assert.equal(normalizeSource('HTTPS://WWW.Example.COM/Acme/Policies/#top'), 'https://www.example.com/Acme/Policies');
  assert.equal(normalizeSource('https://www.example.com/'), 'https://www.example.com');
  assert.equal(normalizeSource('https://www.example.com/a?x=1'), 'https://www.example.com/a?x=1');
  assert.equal(normalizeSource('  <https://www.example.com/a/>  '), 'https://www.example.com/a');
  assert.equal(normalizeSource('DOC:Policy-Motor-7'), 'doc:policy-motor-7');
  assert.equal(normalizeSource('doc:policy\u00a0motor'), 'doc:policy motor');
  assert.equal(normalizeSource('http://example.com'), 'http://example.com', 'the scheme stays part of the source');
  assert.notEqual(normalizeSource('http://example.com/a'), normalizeSource('https://example.com/a'));
});

test('allowedSet and isAllowed: exact entries, and entries that end with * as prefixes', () => {
  const set = allowedSet(['doc:policy-motor-7', 'https://www.example.com/acme/policies/*', 'HTTPS://www.example.com/faq/']);
  assert.equal(isAllowed(set, normalizeSource('DOC:policy-motor-7')), true);
  assert.equal(isAllowed(set, normalizeSource('doc:policy-motor-70')), false);
  assert.equal(isAllowed(set, normalizeSource('https://www.example.com/acme/policies/travel')), true);
  assert.equal(isAllowed(set, normalizeSource('https://www.example.com/acme/policy')), false);
  assert.equal(isAllowed(set, normalizeSource('https://www.example.com/faq')), true);
  assert.equal(isAllowed(set, normalizeSource('https://www.example.com/faq/x')), false);
  assert.equal(isAllowed(allowedSet([]), 'doc:x'), false);
});

test('extractCitations: web addresses without the mark that ends a sentence, document ids and markers, each once', () => {
  const text = 'See https://www.example.com/a/b. Also (https://www.example.com/c), doc:policy-motor-7, DOC:Policy-Motor-7 and doc:faq-1; again https://www.example.com/a/b.';
  const r = extractCitations(text);
  assert.deepEqual(r.cited, ['https://www.example.com/a/b', 'https://www.example.com/c', 'doc:policy-motor-7', 'doc:faq-1']);
  assert.deepEqual(r.unmapped, []);
  assert.equal(r.truncated, false);
});

test('extractCitations: a marker stands for the entry of sources with its number, and one with no entry is reported', () => {
  const r = extractCitations('One [1], two [2] and again [1]. Missing [3] and [0] and [12].', ['doc:a', 'https://www.example.com/b']);
  assert.deepEqual(r.cited, ['doc:a', 'https://www.example.com/b']);
  assert.deepEqual(r.unmapped, ['[3]', '[0]', '[12]']);
  assert.deepEqual(extractCitations('Nothing is cited here.').cited, []);
  assert.deepEqual(extractCitations('A [1] marker').unmapped, ['[1]']);
});

test('extractCitations: an answer that cites more distinct sources than the limit is marked truncated', () => {
  const many = Array.from({ length: WORK_LIMITS.maxCitations + 5 }, (_, i) => `doc:d${i}`).join(' ');
  const r = extractCitations(many);
  assert.equal(r.cited.length, WORK_LIMITS.maxCitations);
  assert.equal(r.truncated, true);
  const urls = Array.from({ length: WORK_LIMITS.maxCitations + 1 }, (_, i) => `https://www.example.com/${i}`).join(' ');
  assert.equal(extractCitations(urls).truncated, true);
  const marks = Array.from({ length: WORK_LIMITS.maxCitations + 1 }, (_, i) => `[${i + 1}]`).join(' ');
  const sources = Array.from({ length: WORK_LIMITS.maxCitations + 1 }, (_, i) => `doc:s${i}`);
  assert.equal(extractCitations(marks, sources).truncated, true);
});
