import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRET_KEYS, cellAt, findSecrets, isSecretKey, readTable, secretShape } from '../src/index.js';

// The values are built from repeated characters, so that no file of the repository holds anything that could be a real key or
// seed.
const MNEMONIC = Array.from({ length: 12 }, (_, i) => `word${'abcdefghijkl'[i]}`.replace(/\d/g, '')).join(' ');
const HEX = 'cd34'.repeat(16);

test('secretShape: a mnemonic, an extended key, a key in hex and a key in WIF, and nothing for ordinary text', () => {
  assert.equal(secretShape(MNEMONIC), 'a mnemonic');
  assert.equal(secretShape(HEX), 'a private key in hex');
  assert.equal(secretShape(`0x${HEX}`), 'a private key in hex');
  assert.equal(secretShape(`xprv${'1'.repeat(100)}`), 'an extended private key');
  assert.equal(secretShape(`5${'1'.repeat(50)}`), 'a private key in WIF');
  assert.equal(secretShape('The excess is 250 for each claim'), null);
  assert.equal(secretShape(HEX.slice(1)), null);
  assert.equal(secretShape('a'.repeat(5000)), null, 'text past 4000 characters is not looked at');
});

test('isSecretKey: names that stand for a seed or a key, with case and separators ignored', () => {
  for (const name of ['mnemonic', 'Seed Phrase', 'private_key', 'PASSWORD', 'secret-key', 'xprv']) assert.equal(isSecretKey(name), true, name);
  for (const name of ['answer', 'expected_facts', 'id']) assert.equal(isSecretKey(name), false, name);
  assert.ok(SECRET_KEYS.includes('mnemonic'));
});

test('findSecrets: a column named for a key and a long cell shaped like one are marked, with their line and column, and no value in the message', () => {
  const text = `id,password,answer\nq1,x,short\nq2,y,${HEX}\n`;
  const table = readTable(text);
  const found = findSecrets(table, cellAt);
  assert.deepEqual(found.map((f) => [f.line, f.column]), [[1, 4], [3, 6]]);
  assert.ok(found.every((f) => !f.message.includes(HEX)));
  assert.ok(table.secretColumns.has(1));
  assert.ok(table.rows[1].secrets.has(2));
  const hexColumns = findSecrets(readTable(`id,answer\nq1,${HEX}\n`), cellAt, new Set([1]));
  assert.deepEqual(hexColumns, []);
});
