import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTaxMinorUnits,
  decimalStringFromMinorUnits,
  roundedRatio,
  toMinorUnits,
} from "../src/utils/money.js";

test("converts monetary values to fixed two-decimal minor units", () => {
  assert.equal(toMinorUnits(1234.56), 123456n);
  assert.equal(decimalStringFromMinorUnits(123456n), "1234.56");
  assert.throws(() => toMinorUnits(1.234), /at most two decimal places/);
});

test("calculates exclusive and inclusive tax in minor units", () => {
  assert.equal(calculateTaxMinorUnits(10000n, 15, "exclusive"), 1500n);
  assert.equal(calculateTaxMinorUnits(11800n, 18, "inclusive"), 1800n);
});

test("rounds positive ratios to the nearest minor unit", () => {
  assert.equal(roundedRatio(1n, 2n), 1n);
  assert.equal(roundedRatio(1n, 3n), 0n);
});
