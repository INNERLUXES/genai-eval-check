import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, InputError, checkFile, decode, displayPath, locateInput, parsePhraseList, readInputText } from '../src/index.js';
import { ARGS, GOOD, cli, jsonl, kase, run, table, withFiles } from './helpers.js';

test('decode: UTF-8 with and without a byte order mark, and UTF-16 in both byte orders', () => {
  assert.equal(decode(Buffer.from('[]\n')), '[]\n');
  assert.equal(decode(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('"\u00e9"', 'utf16le')])), '"\u00e9"');
  const be = Buffer.from('{"a": 1}', 'utf16le').swap16();
  assert.equal(decode(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), '{"a": 1}');
});

test('decode: the byte order mark of UTF-8 is dropped', () => {
  assert.equal(decode(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), '{}');
});

test('decode: a null byte, bytes that are not UTF-8, an odd number of UTF-16 bytes and a lone UTF-16 surrogate are refused', () => {
  assert.throws(() => decode(Buffer.from([0x7b, 0x00, 0x7d])), /null byte/);
  assert.throws(() => decode(Buffer.from([0xc3, 0x28])), /not valid UTF-8/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x61])), /odd number of bytes/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x00, 0xd8])), /not valid UTF-16/);
});

test('displayPath: relative with forward slashes inside the folder, and the whole path outside it', () => {
  const base = resolve('/work/project');
  assert.equal(displayPath(resolve(base, 'evals/cases.jsonl'), base), 'evals/cases.jsonl');
  const outside = resolve(base, '..', 'elsewhere', 'cases.jsonl');
  assert.ok(!displayPath(outside, base).includes('\\'));
  assert.ok(displayPath(outside, base).endsWith('elsewhere/cases.jsonl'));
});

test('locateInput: a file is read; a folder and a missing path are refused', async () => {
  await withFiles({ 'a/cases.jsonl': GOOD['cases.jsonl'] }, async (dir) => {
    assert.equal(await locateInput('a/cases.jsonl', dir), resolve(dir, 'a/cases.jsonl'));
    await assert.rejects(locateInput('a', dir), /is a folder; give the records file/);
    await assert.rejects(locateInput('missing.jsonl', dir), /does not exist/);
    await assert.rejects(locateInput('a/cases.jsonl/x', dir), /does not exist/);
  });
});

test('an absolute path is used as it is, with resolve() and not a join', async () => {
  await withFiles(GOOD, async (dir) => {
    const r = await cli([resolve(dir, 'cases.jsonl')], process.cwd());
    assert.equal(r.code, 0, r.err);
  });
});

test('a file over the size limit is refused before it is read, and the limit is in the error', async () => {
  await withFiles(GOOD, async (dir) => {
    await assert.rejects(checkFile({ path: 'cases.jsonl', version: '0', base: dir, limits: { maxBytes: 100 } }), (e) => e instanceof InputError && /larger than 100 bytes/.test(e.message));
  });
  assert.ok(FILE_LIMITS.maxBytes >= 1024 * 1024);
});

test('a binary file, and bytes that are not UTF-8, are an input error with exit code 2 and no report', async () => {
  const bin = await run({ 'cases.jsonl': Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]) }, ARGS);
  assert.equal(bin.code, 2);
  assert.match(bin.err, /cases.jsonl: holds a null byte/);
  assert.equal(bin.out, '');
  const bad = await run({ 'cases.jsonl': Buffer.from([0x7b, 0xc3, 0x28, 0x7d]) }, ARGS);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /cases.jsonl: is not valid UTF-8/);
  const none = await run({}, ['a.jsonl']);
  assert.match(none.err, /a problem:\n {2}a\.jsonl: does not exist/);
});

test('an empty file, and a file that is not cases, are an error finding, not a pass', async () => {
  const r = await run({ 'cases.jsonl': '' }, ARGS);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR {4}file-unreadable +cases\.jsonl:1\n/);
  assert.match(r.out, /The file holds no text to read as cases/);
  assert.match(r.out, /\nrecords: 0\n/);
  assert.match(r.out, /\ncases: no case was evaluated\n/);
  const open = await run({ 'cases.csv': 'id,answer\nq1,"5\n' }, ['cases.csv']);
  assert.equal(open.code, 1);
  assert.match(open.out, /The file is not a table the reader can follow: The quote that opens the cell was never closed; the file ends inside it\. Nothing was checked\./);
  const header = await run({ 'cases.csv': 'id,answer\n' }, ['cases.csv']);
  assert.equal(header.code, 1);
  assert.match(header.out, /The file holds a header and no rows/);
  const list = await run({ 'cases.json': '[{"id":"a","answer":"x"}]' }, ['cases.json']);
  assert.equal(list.code, 1);
  assert.match(list.out, /starts with a list/);
});

test('UTF-8 with a byte order mark and UTF-16 with one give the same report as the plain file, in JSON Lines and in CSV', async () => {
  const text = jsonl([kase({ id: 'a' }), kase({ id: 'b', answer: 'Never \u00e9.' })]);
  const csv = table(['id', 'answer', 'expected_facts'], [['a', 'Within 30 days', 'within 30 days'], ['b', 'Never \u00e9.', 'within 30 days']]);
  for (const [name, plain] of [['cases.jsonl', text], ['cases.csv', csv]]) {
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(plain)]);
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(plain, 'utf16le')]);
    const be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(plain, 'utf16le').swap16()]);
    const shape = (r) => r.out.split('\n').filter((l) => !l.startsWith('file: ')).join('\n');
    const base = await run({ [name]: plain }, [name]);
    assert.equal(base.code, 1, name);
    for (const content of [bom, le, be]) {
      const r = await run({ [name]: content }, [name]);
      assert.equal(shape(r), shape(base), name);
    }
  }
});

test('a file with another extension is still read by its first character, and a file with tabs as TSV', async () => {
  const r = await run({ 'cases.txt': GOOD['cases.jsonl'] }, ['cases.txt']);
  assert.equal(r.code, 0);
  assert.match(r.out, /\nfile: cases\.txt \(JSONL, /);
  const tsv = await run({ 'cases.tsv': table(['id', 'question', 'answer', 'expected_facts'], [['a', 'How long?', 'Within 30 days', 'within 30 days']], '\t') }, ['cases.tsv']);
  assert.equal(tsv.code, 0, tsv.out);
  assert.match(tsv.out, /\nfile: cases\.tsv \(TSV, /);
  const csv = await run({ 'cases.csv': table(['id', 'question', 'answer', 'expected_facts'], [['a', 'How long?', 'Within 30 days', 'within 30 days']]) }, ['cases.csv']);
  assert.match(csv.out, /\nfile: cases\.csv \(CSV, 2 lines, /);
});

test('a symbolic link is refused by name, not followed', { skip: process.platform === 'win32' ? 'creating symbolic links needs a privilege on Windows' : false }, async () => {
  await withFiles({ 'real/cases.jsonl': GOOD['cases.jsonl'] }, async (dir) => {
    await mkdir(resolve(dir, 'linked'));
    await symlink(resolve(dir, 'real/cases.jsonl'), resolve(dir, 'linked/cases.jsonl'));
    const r = await cli(['linked/cases.jsonl'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /symbolic link/);
    const c = await cli(['real/cases.jsonl', '--refusal-phrases', 'linked/cases.jsonl'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /symbolic link/);
  });
});

test('a device is refused as not a regular file', { skip: process.platform === 'win32' ? 'there is no /dev/null on Windows' : false }, async () => {
  const r = await cli(['/dev/null'], process.cwd());
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('readInputText reads a file through a handle and reports its size in bytes', async () => {
  await withFiles({ 'cases.jsonl': '"\u00e9"\n' }, async (dir) => {
    const r = await readInputText(resolve(dir, 'cases.jsonl'), dir);
    assert.equal(r.text, '"\u00e9"\n');
    assert.equal(r.bytes, 5);
  });
});

test('parsePhraseList: one phrase on each line, empty lines and comments left out, and limits on the list and on a phrase', () => {
  assert.deepEqual(parsePhraseList('# a comment\n\n  no can do  \r\nsorry, no\n'), ['no can do', 'sorry, no']);
  assert.throws(() => parsePhraseList('# only a comment\n\n'), /holds no phrase/);
  assert.throws(() => parsePhraseList(Array.from({ length: 1001 }, (_, i) => `p${i}`).join('\n')), /more than 1000 phrases/);
  assert.throws(() => parsePhraseList('x'.repeat(201)), /longer than 200 characters/);
  assert.equal(parsePhraseList(Array.from({ length: 1000 }, (_, i) => `p${i}`).join('\n')).length, 1000);
});

test('--refusal-phrases replaces the default list with the phrases of a file, read the same bounded way', async () => {
  const cases = jsonl([kase({ answer: 'Nothing doing. Within 30 days.' }), kase({ id: 'q2', must_refuse: 'yes', answer: 'Nothing doing.', expected_facts: undefined })]);
  const files = { 'cases.jsonl': cases, 'refusals.txt': '# mine\nnothing doing\n' };
  const withList = await run(files, [...ARGS, '--refusal-phrases', 'refusals.txt', '--json']);
  const report = JSON.parse(withList.out);
  assert.equal(report.options.refusalPhrases, '1 from a file');
  assert.deepEqual(report.findings.filter((f) => f.severity === 'error').map((f) => f.id).sort(), ['answered-expected-refusal-instead', 'category-pass-rate-below']);
  const without = JSON.parse((await run(files, [...ARGS, '--json'])).out);
  assert.equal(without.options.refusalPhrases, 'default list');
  assert.deepEqual(without.findings.filter((f) => f.severity === 'error').map((f) => f.id).sort(), ['category-pass-rate-below', 'refusal-expected-but-answered']);
  const missing = await run(files, [...ARGS, '--refusal-phrases', 'nope.txt']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /nope\.txt: does not exist/);
  const empty = await run({ ...files, 'refusals.txt': '# nothing\n' }, [...ARGS, '--refusal-phrases', 'refusals.txt']);
  assert.equal(empty.code, 2);
  assert.match(empty.err, /holds no phrase/);
});
