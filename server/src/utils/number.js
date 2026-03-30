export const round2 = (value) => Number(Number(value || 0).toFixed(2));
export const round4 = (value) => Number(Number(value || 0).toFixed(4));

export const toNumber = (value) => Number(value || 0);

export const assertPositive = (value, fieldName) => {
  if (toNumber(value) <= 0) {
    throw new Error(`${fieldName} must be greater than zero`);
  }
};

export const assertNonNegative = (value, fieldName) => {
  if (toNumber(value) < 0) {
    throw new Error(`${fieldName} cannot be negative`);
  }
};