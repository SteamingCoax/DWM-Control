// Pure math helpers for De-Embed polynomial regression.
// Moved verbatim out of main.js (formerly used by the `polynomial-regression`
// IPC handler); behaviour is unchanged.

// Helper function for zero-offset polynomial calculation
function calculateZeroOffsetPolynomial(x, y, degree) {
  const n = x.length;

  // Create design matrix (without constant term for zero offset)
  const A = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 1; j <= degree; j++) {
      row.push(Math.pow(x[i], j));
    }
    A.push(row);
  }

  // Calculate A^T * A
  const AT = transpose(A);
  const ATA = multiply(AT, A);
  const ATy = multiplyVector(AT, y);

  // Solve using Gaussian elimination
  return gaussianElimination(ATA, ATy);
}

function transpose(matrix) {
  return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function multiply(a, b) {
  const result = [];
  for (let i = 0; i < a.length; i++) {
    result[i] = [];
    for (let j = 0; j < b[0].length; j++) {
      result[i][j] = 0;
      for (let k = 0; k < a[0].length; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function multiplyVector(matrix, vector) {
  return matrix.map(row =>
    row.reduce((sum, val, i) => sum + val * vector[i], 0)
  );
}

function gaussianElimination(A, b) {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= c * augmented[i][j];
      }
    }
  }

  // Back substitution
  const solution = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    solution[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      solution[i] -= augmented[i][j] * solution[j];
    }
    solution[i] /= augmented[i][i];
  }

  return solution;
}

module.exports = {
  calculateZeroOffsetPolynomial,
  transpose,
  multiply,
  multiplyVector,
  gaussianElimination,
};
