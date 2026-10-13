// The pass rates, exact. A rate is a count of cases that pass over a count of cases, compared with a minimum written as a
// decimal number of percent by cross multiplication with BigInt, and rounded to one decimal, half up, only when it is shown.
// No floating point number is used anywhere, so 9 of 10 is exactly 90 percent and 899 of 1000 is below it.

import { compareDecimal, parseDecimal } from './decimal.js';

const HUNDRED = { int: 100n, scale: 0 };

// A threshold given as text: a plain decimal from 0 to 100, as a decimal with its text; null when it is not one.
export function readPercent(text) {
  const d = parseDecimal(text);
  if (d === null || compareDecimal(d, HUNDRED) > 0) return null;
  return { ...d, text: `${text}` };
}

// The rate passed / total as a percent with one place, such as "85.7"; total is above zero.
export function percentText(passed, total) {
  const p = BigInt(passed);
  const t = BigInt(total);
  const q = (p * 1000n * 2n + t) / (t * 2n);
  const s = q.toString().padStart(2, '0');
  return `${s.slice(0, -1)}.${s.slice(-1)}`;
}

// Whether passed / total, as a percent, is below the minimum (a decimal of percent), compared exactly.
export function rateBelow(passed, total, min) {
  return BigInt(passed) * 100n * 10n ** BigInt(min.scale) < min.int * BigInt(total);
}
