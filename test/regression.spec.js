'use strict';
// lib/regression.js powers the De-Embed tab's polynomial-regression IPC handler.
// The model is a "zero-offset" polynomial: y = c1*x + c2*x^2 + ... + cn*x^n, with
// no constant term, so the fitted curve always passes through the origin. These
// tests pin the math (moved verbatim out of main.js) and document its behaviour
// on malformed inputs, which is unchanged by the extraction.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateZeroOffsetPolynomial,
  transpose,
  multiply,
  multiplyVector,
  gaussianElimination,
} = require('../lib/regression');

// Build synthetic y values from a known zero-offset polynomial:
// y = coeffs[0]*x + coeffs[1]*x^2 + ... (no constant term).
function evalZeroOffsetPolynomial(coeffs, x) {
  return coeffs.reduce((sum, c, i) => sum + c * Math.pow(x, i + 1), 0);
}

function buildSyntheticData(coeffs, xs) {
  return xs.map((x) => evalZeroOffsetPolynomial(coeffs, x));
}

test('recovers known degree-1 coefficients exactly from noiseless data', () => {
  const trueCoeffs = [2.5];
  const xs = [1, 2, 3, 4, 5];
  const ys = buildSyntheticData(trueCoeffs, xs);

  const fitted = calculateZeroOffsetPolynomial(xs, ys, 1);

  assert.equal(fitted.length, 1);
  trueCoeffs.forEach((c, i) => {
    assert.ok(Math.abs(fitted[i] - c) < 1e-9, `coefficient ${i} off by ${Math.abs(fitted[i] - c)}`);
  });
});

test('recovers known degree-2 coefficients exactly from noiseless data', () => {
  const trueCoeffs = [1.3, -0.7];
  const xs = [1, 2, 3, 4, 5, 6];
  const ys = buildSyntheticData(trueCoeffs, xs);

  const fitted = calculateZeroOffsetPolynomial(xs, ys, 2);

  assert.equal(fitted.length, 2);
  trueCoeffs.forEach((c, i) => {
    assert.ok(Math.abs(fitted[i] - c) < 1e-9, `coefficient ${i} off by ${Math.abs(fitted[i] - c)}`);
  });
});

test('recovers known degree-3 coefficients exactly from noiseless data', () => {
  const trueCoeffs = [0.5, 1.2, -0.05];
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const ys = buildSyntheticData(trueCoeffs, xs);

  const fitted = calculateZeroOffsetPolynomial(xs, ys, 3);

  assert.equal(fitted.length, 3);
  trueCoeffs.forEach((c, i) => {
    assert.ok(Math.abs(fitted[i] - c) < 1e-9, `coefficient ${i} off by ${Math.abs(fitted[i] - c)}`);
  });
});

test('zero-offset property: the fitted curve always passes through the origin', () => {
  // The design matrix only ever contains powers x^1..x^degree (no constant
  // column), so for ANY fitted coefficients, evaluating the model at x=0
  // yields exactly 0 - the fit can never have a nonzero y-intercept.
  const trueCoeffs = [1.3, -0.7];
  const xs = [1, 2, 3, 4, 5, 6];
  const ys = buildSyntheticData(trueCoeffs, xs);
  const fitted = calculateZeroOffsetPolynomial(xs, ys, 2);

  assert.equal(evalZeroOffsetPolynomial(fitted, 0), 0);
});

test('mismatched lengths (y shorter than x): silently produces NaN coefficients, does not throw', () => {
  // multiplyVector(AT, y) indexes `vector[i]` for i up to x.length-1; once i
  // runs past y.length-1, `vector[i]` is undefined and `val * undefined` is
  // NaN, which then poisons every coefficient through Gaussian elimination.
  const xs = [1, 2, 3, 4];
  const ys = [1, 2, 3]; // one short
  const fitted = calculateZeroOffsetPolynomial(xs, ys, 2);

  assert.equal(fitted.length, 2);
  fitted.forEach((c) => assert.ok(Number.isNaN(c)));
});

test('mismatched lengths (y longer than x): extra y values are silently ignored, no error', () => {
  // multiplyVector's `row.reduce(...)` only iterates over the row's own
  // (x.length-many) entries, so trailing y values beyond x.length are never
  // read. The result is a normal-looking (but data-dropping) fit, not a NaN
  // or a thrown error.
  const xs = [1, 2, 3];
  const ys = [1, 2, 3, 4, 5]; // two extra, unused
  const fitted = calculateZeroOffsetPolynomial(xs, ys, 2);

  assert.equal(fitted.length, 2);
  fitted.forEach((c) => assert.ok(Number.isFinite(c)));
  // Pinned to the actual output so a change in this silent-truncation
  // behaviour is caught.
  assert.ok(Math.abs(fitted[0] - 1) < 1e-9);
  assert.ok(Math.abs(fitted[1] - 0) < 1e-9);
});

test('too few points for the degree (1 point, degree 2): produces NaN coefficients, does not throw', () => {
  // A^T*A is singular (rank 1 for a 2-parameter model fit to 1 point), and
  // gaussianElimination divides by a zero pivot, yielding NaN rather than
  // raising an error. The IPC handler in main.js separately guards this case
  // (`xData.length < degree + 1`) before ever calling this function, but the
  // helper itself has no such guard.
  const fitted = calculateZeroOffsetPolynomial([1], [5], 2);

  assert.equal(fitted.length, 2);
  fitted.forEach((c) => assert.ok(Number.isNaN(c)));
});

test('too few points for the degree (2 points, degree 3): singular system yields a finite but spurious fit, not an error', () => {
  // Here A^T*A is singular too, but partial pivoting happens to avoid an
  // exact zero pivot for this particular input, so gaussianElimination
  // returns finite numbers instead of NaN or Infinity. Those numbers are not
  // a meaningful least-squares fit (the system is underdetermined) - this
  // pins the actual, somewhat arbitrary, output so a change is noticed.
  const fitted = calculateZeroOffsetPolynomial([1, 2], [3, 7], 3);

  assert.equal(fitted.length, 3);
  fitted.forEach((c) => assert.ok(Number.isFinite(c)));
  assert.ok(Math.abs(fitted[0] - 7.799999999999968) < 1e-9);
  assert.ok(Math.abs(fitted[1] - -7.449999999999984) < 1e-9);
  assert.ok(Math.abs(fitted[2] - 2.65) < 1e-9);
});

test('gaussianElimination solves a 3x3 system with a known integer solution', () => {
  // Classic textbook system: 2x + y - z = 8, -3x - y + 2z = -11, -2x + y + 2z = -3
  // has the exact solution x=2, y=3, z=-1.
  const A = [
    [2, 1, -1],
    [-3, -1, 2],
    [-2, 1, 2],
  ];
  const b = [8, -11, -3];

  const solution = gaussianElimination(A, b);

  assert.equal(solution.length, 3);
  assert.ok(Math.abs(solution[0] - 2) < 1e-9);
  assert.ok(Math.abs(solution[1] - 3) < 1e-9);
  assert.ok(Math.abs(solution[2] - -1) < 1e-9);
});

test('transpose, multiply, and multiplyVector compose correctly (sanity check for the helpers used above)', () => {
  const A = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];
  const AT = transpose(A);
  assert.deepEqual(AT, [
    [1, 3, 5],
    [2, 4, 6],
  ]);

  const ATA = multiply(AT, A);
  assert.deepEqual(ATA, [
    [35, 44],
    [44, 56],
  ]);

  const ATy = multiplyVector(AT, [1, 1, 1]);
  assert.deepEqual(ATy, [9, 12]);
});
