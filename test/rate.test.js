import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentText, rateBelow, readPercent } from '../src/index.js';

test('readPercent: a plain number from 0 to 100, with its text; anything else is null', () => {
  for (const ok of ['0', '90', '99.9', '100', '100.0', '0.5', '85.123456']) assert.equal(readPercent(ok).text, ok, ok);
  for (const bad of ['101', '100.1', '-1', '1e2', '9,0', '', ' 9', '90%', 'ninety', '0x5', '1'.repeat(50)]) assert.equal(readPercent(bad), null, bad);
});

test('percentText: one decimal, rounded half up, from whole numbers', () => {
  assert.equal(percentText(1, 3), '33.3');
  assert.equal(percentText(2, 3), '66.7');
  assert.equal(percentText(0, 5), '0.0');
  assert.equal(percentText(5, 5), '100.0');
  assert.equal(percentText(1, 8), '12.5');
  assert.equal(percentText(1, 16), '6.3', 'half up: 6.25 is 6.3');
  assert.equal(percentText(3, 6000), '0.1', '0.05 is 0.1');
  assert.equal(percentText(3, 6001), '0.0');
  assert.equal(percentText(99999, 100000), '100.0');
  assert.equal(percentText(9, 10), '90.0');
});

test('rateBelow: compared exactly with the minimum, never through a rounded rate', () => {
  const min = (t) => readPercent(t);
  assert.equal(rateBelow(9, 10, min('90')), false, '9 of 10 is exactly 90');
  assert.equal(rateBelow(899, 1000, min('90')), true, '89.9 is below 90');
  assert.equal(rateBelow(900, 1000, min('90')), false);
  assert.equal(rateBelow(8999, 10000, min('90')), true);
  assert.equal(rateBelow(1, 3, min('33.3')), false, '33.33... is not below 33.3');
  assert.equal(rateBelow(1, 3, min('33.4')), true);
  assert.equal(rateBelow(1, 3, min('33.33333333333333333333')), false, 'a third is above a third cut short');
  assert.equal(rateBelow(1, 3, min('33.33333333333333333334')), true, 'and below a third rounded up');
  assert.equal(rateBelow(0, 5, min('0')), false);
  assert.equal(rateBelow(0, 5, min('0.0001')), true);
  assert.equal(rateBelow(5, 5, min('100')), false);
  assert.equal(rateBelow(4, 5, min('100')), true);
  assert.equal(rateBelow(10 ** 12 - 1, 10 ** 12, min('100')), true, 'a number of cases a double would round');
});
